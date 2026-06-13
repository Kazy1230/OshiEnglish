import os
import uuid
import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import Optional
from app.core.database import get_db
from app.core.security import get_current_user, get_current_admin
from app.core.uploads import validate_image_content
from app.models.message import Message
from app.models.customer import Customer
from app.models.character import Character
from app.models.article import Article
from app.core.intimacy import intimacy_info, POINTS_PER_CHARACTER_REPLY, get_intimacy_settings
from app.core.rewards import check_and_unlock_rewards
from app.core.llm import generate_text, LLMError
from app.core.character_voice import (
    build_dm_reply_system_prompt,
    build_dm_reply_messages,
)
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/messages", tags=["メッセージ（DM）"])

# ご褒美写真などの保存先（main.py で /static にマウントされているディレクトリ配下）
_REWARD_IMAGE_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "static", "reward_images")
os.makedirs(_REWARD_IMAGE_DIR, exist_ok=True)
_ALLOWED_EXT = {".png", ".jpg", ".jpeg", ".webp"}
_MAX_IMAGE_SIZE = 8 * 1024 * 1024  # 8MB

# 何記事おきにご褒美が発生するか
REWARD_INTERVAL = 5


def serialize_message(m: Message) -> dict:
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
        "created_at": m.created_at.isoformat() if m.created_at else None,
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

    return {
        "character": {
            "id": character.id,
            "name": character.name,
            "image_url": character.image_url,
        } if character else None,
        "messages": [serialize_message(m) for m in messages],
        "has_more": has_more,
        "reward_status": _reward_status(db, current_user.id),
        "intimacy": intimacy_info(current_user.intimacy_points),
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
    """
    if not data.content and not data.grammar_topic:
        raise HTTPException(status_code=400, detail="メッセージ内容を入力してください")

    is_request = bool(data.grammar_topic)
    msg = Message(
        customer_id=current_user.id,
        character_id=current_user.character_id,
        sender="customer",
        content=data.content,
        is_request=is_request,
        grammar_topic=data.grammar_topic,
        request_status="pending" if is_request else None,
    )
    db.add(msg)
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
    priority: Optional[str] = None,
    sort: str = "urgency",
    admin=Depends(get_current_admin), db: Session = Depends(get_db),
):
    """管理者向け：DMスレッド一覧（顧客ごとに最新メッセージ・未対応リクエスト数などを表示）

    複数オペレーターでの分担運用のため、担当者・優先度での絞り込みと、
    並び順（未対応優先 / 優先度順 / 最終返信が古い順）を指定できる。
    """
    query = db.query(Customer).filter(Customer.is_admin == False)  # noqa: E712
    if unassigned:
        query = query.filter(Customer.assigned_admin_id.is_(None))
    elif assigned_admin_id is not None:
        query = query.filter(Customer.assigned_admin_id == assigned_admin_id)
    if priority:
        query = query.filter(Customer.priority == priority)
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
            "priority": c.priority,
        })

    if sort == "priority":
        # 優先度（high優先）→ 未対応・未読数 の順
        result.sort(key=lambda r: (0 if r["priority"] == "high" else 1,
                                    -(r["pending_requests"] + r["unread_from_customer"] + r["reward_status"]["pending_rewards"]),
                                    -(r["last_message"]["id"] if r["last_message"] else 0)))
    elif sort == "oldest_reply":
        # 最終メッセージが古い順（対応漏れの発見用）
        result.sort(key=lambda r: r["last_message"]["id"] if r["last_message"] else 0)
    else:
        # デフォルト：未読・未対応がある顧客を上に
        result.sort(key=lambda r: (-(r["pending_requests"] + r["unread_from_customer"] + r["reward_status"]["pending_rewards"]),
                                   -(r["last_message"]["id"] if r["last_message"] else 0)))
    return result


class AssignmentUpdate(BaseModel):
    assigned_admin_id: Optional[int] = None  # null を渡すと未割り当てに戻す
    priority: Optional[str] = None           # "normal" | "high"


@router.patch("/admin/{customer_id}/assignment")
def update_assignment(customer_id: int, data: AssignmentUpdate, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """管理者向け：DMスレッドの担当者・優先度を更新する（複数オペレーターでの分担運用のため）"""
    customer = db.query(Customer).filter(Customer.id == customer_id, Customer.is_admin == False).first()  # noqa: E712
    if not customer:
        raise HTTPException(status_code=404, detail="顧客が見つかりません")

    if "assigned_admin_id" in data.model_fields_set:
        if data.assigned_admin_id is not None:
            operator = db.query(Customer).filter(Customer.id == data.assigned_admin_id, Customer.is_admin == True).first()  # noqa: E712
            if not operator:
                raise HTTPException(status_code=404, detail="担当者が見つかりません")
        customer.assigned_admin_id = data.assigned_admin_id

    if data.priority is not None:
        if data.priority not in ("normal", "high"):
            raise HTTPException(status_code=400, detail="priorityはnormalまたはhighを指定してください")
        customer.priority = data.priority

    db.commit()
    db.refresh(customer)
    return {
        "customer_id": customer.id,
        "assigned_admin_id": customer.assigned_admin_id,
        "assigned_admin_name": customer.assigned_admin.username if customer.assigned_admin else None,
        "priority": customer.priority,
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
        "customer": {"id": customer.id, "username": customer.username, "character_id": customer.character_id,
                     "character_name": customer.character.name if customer.character else None,
                     "character_color_scheme": customer.character.color_scheme if customer.character else None,
                     "character_memory": customer.character_memory,
                     "admin_memo": customer.admin_memo,
                     "tone_profile": customer.character.tone_profile if customer.character else None,
                     "character_description": customer.character.description if customer.character else None,
                     "assigned_admin_id": customer.assigned_admin_id,
                     "assigned_admin_name": customer.assigned_admin.username if customer.assigned_admin else None,
                     "priority": customer.priority},
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


class ReplyCreate(BaseModel):
    content: str


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
    )
    db.add(msg)
    customer.intimacy_points = (customer.intimacy_points or 0) + POINTS_PER_CHARACTER_REPLY
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


@router.post("/admin/{customer_id}/reward")
def send_reward(
    customer_id: int,
    file: UploadFile = File(...),
    message: Optional[str] = Form(None),
    admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """達成記念のご褒美写真をキャラクターから送る（運営者が用意した画像をアップロード）"""
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="顧客が見つかりません")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in _ALLOWED_EXT:
        raise HTTPException(status_code=400, detail="対応していない画像形式です（png/jpg/jpeg/webp のみ）")

    raw = file.file.read()
    if len(raw) > _MAX_IMAGE_SIZE:
        raise HTTPException(status_code=400, detail="画像サイズが大きすぎます（8MBまで）")
    validate_image_content(raw, ext)

    filename = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(_REWARD_IMAGE_DIR, filename)
    with open(path, "wb") as f:
        f.write(raw)

    image_url = f"/static/reward_images/{filename}"
    msg = Message(
        customer_id=customer_id,
        character_id=customer.character_id,
        sender="character",
        content=message.strip() if message and message.strip() else None,
        image_url=image_url,
        is_reward=True,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return serialize_message(msg)
