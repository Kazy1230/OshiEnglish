import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional
from app.core.database import get_db
from app.core.security import get_current_user, get_current_admin
from app.models.message import Message
from app.models.message_feedback import MessageFeedback
from app.models.customer import Customer
from app.models.character import Character
from app.models.article import Article
from app.models.credit_transaction import CreditTransaction
from app.models.order import Order
from app.core.intimacy import intimacy_info, POINTS_PER_CHARACTER_REPLY, get_intimacy_settings
from app.core.character_voice import customer_display_name
from app.core.rewards import check_and_unlock_rewards
from app.core.credits import grant_credits, consume_credits, ARTICLE_REQUEST_FEE, ALLOWED_ARTICLE_REQUEST_CREDIT_COSTS, DM_SEND_COST
from app.core.llm import generate_text, LLMError
from app.core.character_voice import (
    build_dm_reply_system_prompt,
    build_dm_reply_messages,
)
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/messages", tags=["メッセージ（DM）"])

# 何記事おきにご褒美が発生するか
REWARD_INTERVAL = 5


def serialize_message(m: Message, my_feedback: Optional[str] = None) -> dict:
    return {
        "id": m.id,
        "customer_id": m.customer_id,
        "character_id": m.character_id,
        "sender": m.sender,
        "content": m.content,
        "image_url": m.image_url,
        "is_request": m.is_request,
        "grammar_topic": m.grammar_topic,
        "request_status": m.request_status,
        "is_reward": m.is_reward,
        "is_read": m.is_read,
        "is_exercise_submission": m.is_exercise_submission,
        "article_id": m.article_id,
        "suggested_action": m.suggested_action,
        "created_at": m.created_at.isoformat() if m.created_at else None,
        "my_feedback": my_feedback,
    }


# DMスレッドは1顧客ごとに無制限に蓄積されるため、全件返すとヘビーユーザーほど
# レスポンスが線形に重くなる。直近N件＋カーソルページネーションで取得する。
DEFAULT_MESSAGE_PAGE_SIZE = 50


def _get_messages_page(db: Session, customer_id: int, limit: int, before_id: Optional[int]):
    """指定顧客のメッセージを新しい順にlimit件取得し、古い→新しい順に並べ替えて返す。
    before_id を指定すると、そのメッセージより古いものを取得する（無限スクロール用）。
    戻り値: (messages_asc, has_more)
    """
    query = db.query(Message).filter(Message.customer_id == customer_id)
    if before_id is not None:
        query = query.filter(Message.id < before_id)
    rows = query.order_by(Message.id.desc()).limit(limit + 1).all()
    has_more = len(rows) > limit
    rows = rows[:limit]
    return list(reversed(rows)), has_more


def _published_count(db: Session, customer_id: int) -> int:
    return db.query(Article).filter(
        Article.customer_id == customer_id,
        Article.status == "published",
    ).count()


def _reward_status(db: Session, customer_id: int) -> dict:
    """ご褒美の進捗状況を計算する。
    「達成済みのご褒美マイルストーン数」 と「すでに送付済みのご褒美数」を比較し、
    未送付のご褒美があるかどうかを判定する。
    """
    published = _published_count(db, customer_id)
    earned_milestones = published // REWARD_INTERVAL
    sent_rewards = db.query(Message).filter(
        Message.customer_id == customer_id,
        Message.is_reward == True,  # noqa: E712
    ).count()
    pending = max(0, earned_milestones - sent_rewards)
    next_target = (sent_rewards + 1) * REWARD_INTERVAL
    return {
        "published_articles": published,
        "reward_interval": REWARD_INTERVAL,
        "earned_milestones": earned_milestones,
        "sent_rewards": sent_rewards,
        "pending_rewards": pending,
        "articles_until_next_reward": max(0, next_target - published),
        "next_reward_target": next_target,
    }


# ===================== 顧客向け =====================

class MessageCreate(BaseModel):
    content: Optional[str] = None
    grammar_topic: Optional[str] = None  # 入力されると「記事リクエスト」として扱われる
    credit_cost: Optional[int] = None  # 記事・問題リクエスト時の消費クレジット数（200/400）


@router.get("/me")
def get_my_thread(
    limit: int = DEFAULT_MESSAGE_PAGE_SIZE,
    before_id: Optional[int] = None,
    current_user: Customer = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """ログイン中の顧客と、担当キャラクターとのDMスレッドを取得

    デフォルトでは直近 limit 件のみ返す。before_id を指定すると、
    そのメッセージより古いメッセージを追加で取得できる（過去ログの読み込み用）。
    """
    messages, has_more = _get_messages_page(db, current_user.id, limit, before_id)

    # 表示時に character→customer のメッセージを既読にする（最新ページ取得時のみ）
    if before_id is None:
        unread = [m for m in messages if m.sender == "character" and not m.is_read]
        for m in unread:
            m.is_read = True
        if unread:
            db.commit()

    character = None
    if current_user.character_id:
        character = db.query(Character).filter(Character.id == current_user.character_id).first()

    feedback_rows = db.query(MessageFeedback).filter(
        MessageFeedback.customer_id == current_user.id,
        MessageFeedback.message_id.in_([m.id for m in messages]),
    ).all()
    feedback_map = {f.message_id: f.rating for f in feedback_rows}

    return {
        "character": {
            "id": character.id,
            "name": character.name,
            "image_url": character.image_url,
        } if character else None,
        "messages": [serialize_message(m, feedback_map.get(m.id)) for m in messages],
        "has_more": has_more,
        "reward_status": _reward_status(db, current_user.id),
        "intimacy": intimacy_info(current_user.intimacy_points),
        "credit_balance": current_user.credit_balance,
    }


@router.post("/me")
def send_my_message(
    data: MessageCreate,
    current_user: Customer = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """顧客からキャラクターへメッセージを送る（grammar_topicがあれば記事リクエストとして扱う）

    会話のやり取りは「親密度」に少しずつ反映される
    （送るたびに大きく増えるものではなく、コツコツ続けることで関係が育っていく設計）。

    DM送信は1クレジット、記事・問題リクエストは依頼時にARTICLE_REQUEST_FEE（50）のみ消費する。
    残りの金額（credit_cost - ARTICLE_REQUEST_FEE）は、記事完成後に本棚で開封する際に消費する。
    残高不足の場合は402を返す。
    """
    if not data.content and not data.grammar_topic:
        raise HTTPException(status_code=400, detail="メッセージ内容を入力してください")

    is_request = bool(data.grammar_topic)
    if is_request and data.credit_cost not in ALLOWED_ARTICLE_REQUEST_CREDIT_COSTS:
        raise HTTPException(status_code=400, detail="credit_costの値が不正です")
    cost = ARTICLE_REQUEST_FEE if is_request else DM_SEND_COST
    consume_credits(
        db, current_user, cost,
        reason="article_request" if is_request else "dm_send",
    )

    msg = Message(
        customer_id=current_user.id,
        character_id=current_user.character_id,
        sender="customer",
        content=data.content,
        is_request=is_request,
        grammar_topic=data.grammar_topic,
        request_status="accepted" if is_request else None,
        credit_cost=data.credit_cost if is_request else None,
    )
    db.add(msg)
    db.flush()

    last_tx = (
        db.query(CreditTransaction)
        .filter(CreditTransaction.customer_id == current_user.id)
        .order_by(CreditTransaction.id.desc())
        .first()
    )
    if last_tx:
        last_tx.related_message_id = msg.id

    if is_request:
        # 受注リストに自動反映: 既に紐づく受注がなければ、この依頼を新規受注として追加する
        existing_order = db.query(Order).filter(Order.customer_id == current_user.id).first()
        if not existing_order:
            character = db.query(Character).filter(Character.id == current_user.character_id).first()
            db.add(Order(
                customer_name=current_user.username,
                character_name=character.name if character else None,
                grammar_topic=data.grammar_topic,
                status="in_progress",
                customer_id=current_user.id,
                email=current_user.email,
            ))

    settings_row = get_intimacy_settings(db)
    current_user.intimacy_points = (current_user.intimacy_points or 0) + settings_row.points_per_message
    check_and_unlock_rewards(db, current_user)
    db.commit()
    db.refresh(msg)

    return serialize_message(msg)


@router.get("/me/unread-count")
def get_my_unread_count(current_user: Customer = Depends(get_current_user), db: Session = Depends(get_db)):
    """本棚画面などでLINE風の未読バッジを表示するためのカウント（既読化はしない）"""
    count = db.query(Message).filter(
        Message.customer_id == current_user.id,
        Message.sender == "character",
        Message.is_read == False,  # noqa: E712
    ).count()
    return {"unread": count}


@router.get("/me/reward-status")
def get_my_reward_status(current_user: Customer = Depends(get_current_user), db: Session = Depends(get_db)):
    return _reward_status(db, current_user.id)


class MessageFeedbackCreate(BaseModel):
    rating: str  # good / bad


@router.post("/{message_id}/feedback")
def rate_message(
    message_id: int,
    data: MessageFeedbackCreate,
    current_user: Customer = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """顧客向け：キャラからの返信メッセージに👍👎評価を付ける（押し直しで変更可）"""
    if data.rating not in ("good", "bad"):
        raise HTTPException(status_code=400, detail="ratingはgoodまたはbadで指定してください")

    msg = db.query(Message).filter(
        Message.id == message_id,
        Message.customer_id == current_user.id,
        Message.sender == "character",
    ).first()
    if not msg:
        raise HTTPException(status_code=404, detail="メッセージが見つかりません")

    feedback = db.query(MessageFeedback).filter(
        MessageFeedback.message_id == message_id,
        MessageFeedback.customer_id == current_user.id,
    ).first()
    if feedback:
        feedback.rating = data.rating
        feedback.status = "pending"
        feedback.message_content = msg.content
    else:
        feedback = MessageFeedback(
            message_id=msg.id,
            character_id=msg.character_id,
            customer_id=current_user.id,
            rating=data.rating,
            message_content=msg.content,
            status="pending",
        )
        db.add(feedback)
    db.commit()
    return {"message_id": msg.id, "rating": data.rating}


@router.delete("/{message_id}/feedback")
def remove_message_rating(
    message_id: int,
    current_user: Customer = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """顧客向け：付けた👍👎評価を取り消す"""
    feedback = db.query(MessageFeedback).filter(
        MessageFeedback.message_id == message_id,
        MessageFeedback.customer_id == current_user.id,
    ).first()
    if feedback:
        db.delete(feedback)
        db.commit()
    return {"message_id": message_id, "rating": None}


# ===================== 管理者向け =====================

@router.get("/admin/operators")
def list_operators(admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """管理者向け：担当割り当て候補となる管理者・オペレーター一覧（is_admin=Trueのアカウント）"""
    operators = db.query(Customer).filter(Customer.is_admin == True).all()  # noqa: E712
    return [{"id": o.id, "username": o.username} for o in operators]


@router.get("/admin/threads")
def list_threads(
    assigned_admin_id: Optional[int] = None,
    unassigned: bool = False,
    sort: str = "urgency",
    admin=Depends(get_current_admin), db: Session = Depends(get_db),
):
    """管理者向け：DMスレッド一覧（顧客ごとに最新メッセージ・未対応リクエスト数などを表示）

    複数オペレーターでの分担運用のため、担当者での絞り込みと、
    並び順（未対応優先 / 最終返信が古い順）を指定できる。
    """
    query = db.query(Customer).filter(Customer.is_admin == False)  # noqa: E712
    if unassigned:
        query = query.filter(Customer.assigned_admin_id.is_(None))
    elif assigned_admin_id is not None:
        query = query.filter(Customer.assigned_admin_id == assigned_admin_id)
    customers = query.all()

    result = []
    for c in customers:
        last_msg = db.query(Message).filter(Message.customer_id == c.id).order_by(Message.created_at.desc()).first()
        pending_requests = db.query(Message).filter(
            Message.customer_id == c.id,
            Message.is_request == True,  # noqa: E712
            Message.request_status == "pending",
        ).count()
        unread_from_customer = db.query(Message).filter(
            Message.customer_id == c.id,
            Message.sender == "customer",
            Message.is_read == False,  # noqa: E712
        ).count()
        reward = _reward_status(db, c.id)
        result.append({
            "customer_id": c.id,
            "username": c.username,
            "display_name": customer_display_name(c),
            "character_id": c.character_id,
            "character_name": c.character.name if c.character else None,
            "character_color_scheme": c.character.color_scheme if c.character else None,
            "last_message": serialize_message(last_msg) if last_msg else None,
            "pending_requests": pending_requests,
            "unread_from_customer": unread_from_customer,
            "reward_status": reward,
            "intimacy": intimacy_info(c.intimacy_points),
            "assigned_admin_id": c.assigned_admin_id,
            "assigned_admin_name": c.assigned_admin.username if c.assigned_admin else None,
        })

    if sort == "oldest_reply":
        # 最終メッセージが古い順（対応漏れの発見用）
        result.sort(key=lambda r: r["last_message"]["id"] if r["last_message"] else 0)
    else:
        # デフォルト：未読・未対応がある顧客を上に
        result.sort(key=lambda r: (-(r["pending_requests"] + r["unread_from_customer"] + r["reward_status"]["pending_rewards"]),
                                   -(r["last_message"]["id"] if r["last_message"] else 0)))
    return result


class AssignmentUpdate(BaseModel):
    assigned_admin_id: Optional[int] = None  # null を渡すと未割り当てに戻す


@router.patch("/admin/{customer_id}/assignment")
def update_assignment(customer_id: int, data: AssignmentUpdate, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """管理者向け：DMスレッドの担当者を更新する（複数オペレーターでの分担運用のため）"""
    customer = db.query(Customer).filter(Customer.id == customer_id, Customer.is_admin == False).first()  # noqa: E712
    if not customer:
        raise HTTPException(status_code=404, detail="顧客が見つかりません")

    if "assigned_admin_id" in data.model_fields_set:
        if data.assigned_admin_id is not None:
            operator = db.query(Customer).filter(Customer.id == data.assigned_admin_id, Customer.is_admin == True).first()  # noqa: E712
            if not operator:
                raise HTTPException(status_code=404, detail="担当者が見つかりません")
        customer.assigned_admin_id = data.assigned_admin_id

    db.commit()
    db.refresh(customer)
    return {
        "customer_id": customer.id,
        "assigned_admin_id": customer.assigned_admin_id,
        "assigned_admin_name": customer.assigned_admin.username if customer.assigned_admin else None,
    }


# 提出メッセージ本文の先頭につく定型句（articles.py の submit_written_exercise と対応）
_EXERCISE_SUBMISSION_PREFIX_END = "】\n\n"


def _strip_submission_prefix(content: Optional[str]) -> str:
    """提出メッセージ本文から「【演習問題「○○」への解答を提出します】」の定型句を除いた解答本文を返す。"""
    text = content or ""
    if text.startswith("【") and _EXERCISE_SUBMISSION_PREFIX_END in text:
        return text.split(_EXERCISE_SUBMISSION_PREFIX_END, 1)[1]
    return text


@router.get("/admin/exercise-submissions")
def list_exercise_submissions(admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """管理者向け：添削専用画面のための、未対応（未返信）の記述式演習の解答提出一覧を返す。

    「未対応」は、その提出より後にキャラクター（運営）からの返信メッセージが
    まだ送られていないことで判定する。
    """
    submissions = db.query(Message).filter(
        Message.is_exercise_submission == True,  # noqa: E712
        Message.sender == "customer",
    ).order_by(Message.id.asc()).all()

    result = []
    for sub in submissions:
        replied = db.query(Message).filter(
            Message.customer_id == sub.customer_id,
            Message.sender == "character",
            Message.id > sub.id,
        ).first()
        if replied:
            continue

        customer = sub.customer
        article = sub.article
        exercise_data = (article.exercise_data or {}) if article else {}
        result.append({
            "message": serialize_message(sub),
            "submission_text": _strip_submission_prefix(sub.content),
            "customer_id": sub.customer_id,
            "username": customer.username if customer else None,
            "character_name": customer.character.name if customer and customer.character else None,
            "article_id": sub.article_id,
            "article_title": article.title if article else None,
            "exercise_prompt": exercise_data.get("prompt"),
        })
    return result


# ===================== 修正サジェスト一覧（メッセージ評価） =====================
# 注意: GET /admin/{customer_id} よりも前に定義すること。
# FastAPIはルート登録順に一致を試みるため、後で定義すると "/admin/feedback" が
# "/admin/{customer_id}" (customer_id="feedback") にマッチしてしまい422になる。

REACTION_EXAMPLE_CATEGORIES = ("mistake", "question", "correct_answer", "encouragement")


def _serialize_feedback(f: MessageFeedback, db: Session) -> dict:
    character = db.query(Character).filter(Character.id == f.character_id).first() if f.character_id else None
    customer = db.query(Customer).filter(Customer.id == f.customer_id).first()
    return {
        "id": f.id,
        "message_id": f.message_id,
        "character_id": f.character_id,
        "character_name": character.name if character else None,
        "customer_id": f.customer_id,
        "customer_name": customer.username if customer else None,
        "rating": f.rating,
        "message_content": f.message_content,
        "status": f.status,
        "created_at": f.created_at.isoformat() if f.created_at else None,
    }


@router.get("/admin/feedback")
def list_message_feedback(
    character_id: Optional[int] = None,
    rating: Optional[str] = None,
    admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """管理者向け：「修正サジェスト一覧」。未対応（status=pending）の👍👎評価を一覧表示する。"""
    query = db.query(MessageFeedback).filter(MessageFeedback.status == "pending")
    if character_id is not None:
        query = query.filter(MessageFeedback.character_id == character_id)
    if rating is not None:
        if rating not in ("good", "bad"):
            raise HTTPException(status_code=400, detail="ratingはgoodまたはbadで指定してください")
        query = query.filter(MessageFeedback.rating == rating)
    rows = query.order_by(MessageFeedback.created_at.desc()).all()
    return [_serialize_feedback(f, db) for f in rows]


@router.get("/admin/{customer_id}")
def get_thread_admin(
    customer_id: int,
    limit: int = DEFAULT_MESSAGE_PAGE_SIZE,
    before_id: Optional[int] = None,
    admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """管理者向け：DMスレッド取得。

    デフォルトでは直近 limit 件のみ返す。before_id を指定すると、
    そのメッセージより古いメッセージを追加で取得できる（過去ログの読み込み用）。
    """
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="顧客が見つかりません")

    messages, has_more = _get_messages_page(db, customer_id, limit, before_id)

    # 管理者が開いたら「顧客からの未読」を既読にする（最新ページ取得時のみ）
    if before_id is None:
        unread = [m for m in messages if m.sender == "customer" and not m.is_read]
        for m in unread:
            m.is_read = True
        if unread:
            db.commit()

    return {
        "customer": {"id": customer.id, "username": customer.username, "display_name": customer_display_name(customer), "character_id": customer.character_id,
                     "character_name": customer.character.name if customer.character else None,
                     "character_color_scheme": customer.character.color_scheme if customer.character else None,
                     "character_memory": customer.character_memory,
                     "admin_memo": customer.admin_memo,
                     "tone_profile": customer.character.tone_profile if customer.character else None,
                     "character_description": customer.character.description if customer.character else None,
                     "assigned_admin_id": customer.assigned_admin_id,
                     "assigned_admin_name": customer.assigned_admin.username if customer.assigned_admin else None},
        "messages": [serialize_message(m) for m in messages],
        "has_more": has_more,
        "reward_status": _reward_status(db, customer_id),
        "intimacy": intimacy_info(customer.intimacy_points),
    }


class IntimacyAdjust(BaseModel):
    delta: int          # 増減量（マイナス値で減少）
    reason: Optional[str] = None  # 調整理由（ログ・将来の振り返り用、任意）


@router.post("/admin/{customer_id}/intimacy/adjust")
def adjust_intimacy(customer_id: int, data: IntimacyAdjust, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """管理者が手動で親密度を増減する。

    顧客の返信内容（冷たい・嬉しい等）に応じて、運営判断で関係性の進み具合を調整できるようにする。
    0を下回らないようにクランプし、不自然な状態（マイナスの親密度）にはならないようにする。
    """
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="顧客が見つかりません")
    if data.delta == 0:
        raise HTTPException(status_code=400, detail="増減量を指定してください")

    before = customer.intimacy_points or 0
    customer.intimacy_points = max(0, before + data.delta)
    check_and_unlock_rewards(db, customer)
    db.commit()
    db.refresh(customer)

    logger.info(
        f"管理者が親密度を調整しました: customer_id={customer_id} "
        f"{before} -> {customer.intimacy_points} (delta={data.delta}, reason={data.reason!r})"
    )
    return {
        "intimacy": intimacy_info(customer.intimacy_points),
        "before_points": before,
    }


class CreditAdjust(BaseModel):
    delta: int          # 増減量（マイナス値で減少）
    reason: Optional[str] = None  # 調整理由（ログ・将来の振り返り用、任意）


@router.post("/admin/{customer_id}/credits/adjust")
def adjust_credits(customer_id: int, data: CreditAdjust, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """管理者が手動でクレジット残高を増減する（問い合わせ対応・補填など）"""
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="顧客が見つかりません")
    if data.delta == 0:
        raise HTTPException(status_code=400, detail="増減量を指定してください")

    before = customer.credit_balance or 0
    if data.delta > 0:
        grant_credits(db, customer, data.delta, reason="admin_adjust")
    else:
        consume_credits(db, customer, -data.delta, reason="admin_adjust")
    db.commit()
    db.refresh(customer)

    logger.info(
        f"管理者がクレジット残高を調整しました: customer_id={customer_id} "
        f"{before} -> {customer.credit_balance} (delta={data.delta}, reason={data.reason!r})"
    )
    return {
        "credit_balance": customer.credit_balance,
        "before_balance": before,
    }


class ReplyCreate(BaseModel):
    content: str
    suggested_action: Optional[str] = None  # 例: "request_correction"（添削してもらうCTAボタンを表示）


@router.post("/admin/{customer_id}/reply")
def reply_as_character(customer_id: int, data: ReplyCreate, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """管理者がキャラクターになりきって返信する（テキスト）"""
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="顧客が見つかりません")
    if not data.content or not data.content.strip():
        raise HTTPException(status_code=400, detail="返信内容を入力してください")

    msg = Message(
        customer_id=customer_id,
        character_id=customer.character_id,
        sender="character",
        content=data.content.strip(),
        suggested_action=data.suggested_action,
    )
    db.add(msg)
    customer.intimacy_points = (customer.intimacy_points or 0) + POINTS_PER_CHARACTER_REPLY
    check_and_unlock_rewards(db, customer)
    db.commit()
    db.refresh(msg)
    return serialize_message(msg)


@router.post("/admin/{customer_id}/draft-reply")
def draft_reply(customer_id: int, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """管理者向け：直近の会話履歴とキャラクター設定をもとに、DM返信の下書きをAIに生成させる。

    生成された文章はそのまま送信されるわけではなく、管理者が確認・編集したうえで
    既存の /admin/{customer_id}/reply で送信する（半自動化であり全自動化ではない）。
    """
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="顧客が見つかりません")

    character = db.query(Character).filter(Character.id == customer.character_id).first() if customer.character_id else None

    history, _ = _get_messages_page(db, customer_id, limit=5, before_id=None)

    system_prompt = build_dm_reply_system_prompt(character, customer, intimacy_info(customer.intimacy_points))
    conversation = build_dm_reply_messages(history)

    try:
        draft = generate_text(system_prompt, conversation)
    except LLMError as e:
        raise HTTPException(status_code=502, detail=str(e))

    return {"draft": draft}


class AdminMemoUpdate(BaseModel):
    admin_memo: str


@router.patch("/admin/{customer_id}/memo")
def update_admin_memo(customer_id: int, data: AdminMemoUpdate, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """管理者向け：DM対応で「重要だと感じたこと」を記録するメモを更新する。

    ここに記録した内容はDM返信下書き生成プロンプトに織り込まれる。
    """
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="顧客が見つかりません")

    customer.admin_memo = data.admin_memo.strip() or None
    db.commit()
    return {"admin_memo": customer.admin_memo}


class MessageEdit(BaseModel):
    content: str


@router.patch("/admin/message/{message_id}")
def edit_message_as_admin(message_id: int, data: MessageEdit, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """管理者向け：DM内のメッセージ本文を編集する（誤送信の訂正・表現の修正など）

    送信元（顧客／キャラクター）を問わず編集可能だが、画像やご褒美添付・記事リクエスト情報などの
    付随データは変更しない（本文テキストのみ差し替える）。
    """
    if not data.content or not data.content.strip():
        raise HTTPException(status_code=400, detail="メッセージ内容を入力してください")
    msg = db.query(Message).filter(Message.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="メッセージが見つかりません")
    msg.content = data.content.strip()
    db.commit()
    db.refresh(msg)
    logger.info(f"管理者がメッセージを編集しました: message_id={message_id}")
    return serialize_message(msg)


@router.delete("/admin/message/{message_id}")
def delete_message_as_admin(message_id: int, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """管理者向け：DM内のメッセージを削除する（誤送信・不適切投稿の削除など）"""
    msg = db.query(Message).filter(Message.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="メッセージが見つかりません")
    db.delete(msg)
    db.commit()
    logger.info(f"管理者がメッセージを削除しました: message_id={message_id}")
    return {"message": "削除しました"}


@router.patch("/admin/request/{message_id}")
def update_request_status(message_id: int, status: str, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """記事リクエストの対応状況を更新（pending / accepted / completed）"""
    if status not in ("pending", "accepted", "completed"):
        raise HTTPException(status_code=400, detail="不正なステータスです")
    msg = db.query(Message).filter(Message.id == message_id, Message.is_request == True).first()  # noqa: E712
    if not msg:
        raise HTTPException(status_code=404, detail="リクエストが見つかりません")
    msg.request_status = status
    db.commit()
    db.refresh(msg)
    return serialize_message(msg)


@router.get("/admin/requests/{customer_id}")
def get_customer_open_requests(customer_id: int, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """指定顧客の対応中（pending/accepted）の記事リクエスト一覧を取得する（依頼記事作成時の紐付け選択用）"""
    msgs = (
        db.query(Message)
        .filter(
            Message.customer_id == customer_id,
            Message.is_request == True,  # noqa: E712
            Message.request_status != "completed",
        )
        .order_by(Message.created_at.desc())
        .all()
    )
    return [serialize_message(m) for m in msgs]


# ===================== 修正サジェスト適用・無視 =====================

class FeedbackApply(BaseModel):
    # rating=goodの場合のみ必須。reaction_examplesの追加先カテゴリ。
    category: Optional[str] = None


@router.post("/admin/feedback/{feedback_id}/apply")
def apply_message_feedback(
    feedback_id: int,
    data: FeedbackApply,
    admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """管理者向け：サジェストをキャラクターのTONE_PROFILEに反映する。
    👍 → reaction_examples.<category> に追加、👎 → ng_expressions に追加。
    """
    feedback = db.query(MessageFeedback).filter(MessageFeedback.id == feedback_id).first()
    if not feedback:
        raise HTTPException(status_code=404, detail="サジェストが見つかりません")
    if not feedback.message_content or not feedback.message_content.strip():
        raise HTTPException(status_code=400, detail="メッセージ本文が空のため反映できません")
    if not feedback.character_id:
        raise HTTPException(status_code=400, detail="キャラクターが特定できないため反映できません")

    character = db.query(Character).filter(Character.id == feedback.character_id).first()
    if not character:
        raise HTTPException(status_code=404, detail="キャラクターが見つかりません")

    tone_profile = dict(character.tone_profile or {})
    content = feedback.message_content.strip()

    if feedback.rating == "good":
        if data.category not in REACTION_EXAMPLE_CATEGORIES:
            raise HTTPException(status_code=400, detail="categoryはmistake/question/correct_answer/encouragementのいずれかで指定してください")
        reaction_examples = dict(tone_profile.get("reaction_examples") or {})
        examples = list(reaction_examples.get(data.category) or [])
        if content not in examples:
            examples.append(content)
        reaction_examples[data.category] = examples
        tone_profile["reaction_examples"] = reaction_examples
    elif feedback.rating == "bad":
        ng_expressions = list(tone_profile.get("ng_expressions") or [])
        if content not in ng_expressions:
            ng_expressions.append(content)
        tone_profile["ng_expressions"] = ng_expressions
    else:
        raise HTTPException(status_code=400, detail="不正な評価データです")

    character.tone_profile = tone_profile
    feedback.status = "reviewed"
    db.commit()
    db.refresh(character)
    return {"message": "反映しました", "tone_profile": character.tone_profile}


@router.post("/admin/feedback/{feedback_id}/ignore")
def ignore_message_feedback(feedback_id: int, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """管理者向け：サジェストを無視し、一覧から除外する"""
    feedback = db.query(MessageFeedback).filter(MessageFeedback.id == feedback_id).first()
    if not feedback:
        raise HTTPException(status_code=404, detail="サジェストが見つかりません")
    feedback.status = "reviewed"
    db.commit()
    return {"message": "無視しました"}
