from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime
from app.core.database import get_db
from app.core.security import get_current_admin, get_current_user
from app.core.receipt import generate_receipt_pdf, format_amount
from app.core.rate_limit import enforce_rate_limit
from app.models.order import Order
from app.models.customer import Customer
from app.models.message import Message
from app.models.correction_request import CorrectionRequest
from app.models.article import Article
from app.models.reward import RewardItem
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/orders", tags=["受注管理"])

def serialize_order(
    o: Order,
    customer_username: Optional[str] = None,
    pending_corrections: Optional[list] = None,
    pending_article_requests: Optional[list] = None,
    character_creation_pending: bool = False,
    customer_character_id: Optional[int] = None,
    reward_loop_pending: bool = False,
    welcome_page_pending: bool = False,
    greeting_dm_pending: bool = False,
) -> dict:
    return {
        "id": o.id,
        "customer_name": o.customer_name,
        "contact": o.contact,
        "character_name": o.character_name,
        "grammar_topic": o.grammar_topic,
        "status": o.status,
        "order_type": o.order_type,
        "notes": o.notes,
        "customer_id": o.customer_id,                   # 紐づいた顧客アカウントID（null = 未紐づけ）
        "customer_username": customer_username,          # 紐づいた顧客のユーザー名（表示用）
        "customer_character_id": customer_character_id,  # 紐づいた顧客のキャラクターID（記事作成フォームの自動入力用）
        "form_submitted_at": o.form_submitted_at.isoformat() if o.form_submitted_at else None,
        "created_at": o.created_at.isoformat() if o.created_at else None,
        "updated_at": o.updated_at.isoformat() if o.updated_at else None,
        # 受注に紐づく顧客の対応待ち事項（管理画面で「子要素」として表示するため）
        "pending_corrections": pending_corrections or [],          # 添削リクエスト（未完了）
        "pending_article_requests": pending_article_requests or [],  # 記事リクエスト（未完了）
        "character_creation_pending": character_creation_pending,    # キャラクター作成が未完了か
        "reward_loop_pending": reward_loop_pending,        # そのキャラの報酬・成長ループが未設定か
        "welcome_page_pending": welcome_page_pending,      # そのキャラ専用のウェルカムページが未作成か
        "greeting_dm_pending": greeting_dm_pending,        # 顧客への挨拶DMが未送信か
    }

class OrderUpdate(BaseModel):
    status: Optional[str] = None  # new / in_progress / delivered
    notes: Optional[str] = None
    customer_id: Optional[int] = None  # 顧客アカウントとの紐づけ（null で解除）

class OrderCreate(BaseModel):
    """管理者が手動で受注を追加する際の入力（電話・対面・LINEなど、フォーム経由以外で受けた注文用）"""
    customer_name: str
    contact: Optional[str] = None
    character_name: Optional[str] = None
    grammar_topic: Optional[str] = None
    status: str = "new"  # new / in_progress / delivered
    notes: Optional[str] = None

# ===== 管理者向け =====
@router.get("/")
def list_orders(admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    orders = db.query(Order).order_by(Order.created_at.desc()).all()
    # 紐づき顧客のユーザー名・キャラ作成状況を一括取得（N+1回避）
    customer_ids = {o.customer_id for o in orders if o.customer_id}
    username_map: dict = {}
    character_id_map: dict = {}
    if customer_ids:
        custs = db.query(Customer.id, Customer.username, Customer.character_id).filter(Customer.id.in_(customer_ids)).all()
        username_map = {c.id: c.username for c in custs}
        character_id_map = {c.id: c.character_id for c in custs}

    # 未完了の添削リクエスト（顧客IDごとにグループ化）
    corrections_map: dict = {}
    if customer_ids:
        corrections = (
            db.query(CorrectionRequest)
            .filter(CorrectionRequest.customer_id.in_(customer_ids), CorrectionRequest.status != "completed")
            .order_by(CorrectionRequest.created_at.asc())
            .all()
        )
        for cr in corrections:
            corrections_map.setdefault(cr.customer_id, []).append({
                "id": cr.id,
                "correction_type": cr.correction_type,
                "status": cr.status,
            })

    # 未完了の記事リクエスト（顧客IDごとにグループ化）
    requests_map: dict = {}
    if customer_ids:
        requests = (
            db.query(Message)
            .filter(
                Message.customer_id.in_(customer_ids),
                Message.is_request == True,  # noqa: E712
                Message.request_status.in_(["pending", "accepted"]),
            )
            .order_by(Message.created_at.asc())
            .all()
        )
        for m in requests:
            requests_map.setdefault(m.customer_id, []).append({
                "id": m.id,
                "grammar_topic": m.grammar_topic,
                "request_status": m.request_status,
            })

    # オリジナルキャラ申し込み時に同時起票する3つのタスク（報酬・成長ループ／ウェルカムページ／挨拶DM）の
    # 完了判定に使う集合を一括取得する（N+1回避）
    character_ids = {cid for cid in character_id_map.values() if cid}
    reward_configured_char_ids: set = set()
    welcome_configured_char_ids: set = set()
    if character_ids:
        reward_configured_char_ids = {
            cid for (cid,) in db.query(RewardItem.character_id).filter(RewardItem.character_id.in_(character_ids)).distinct().all()
        }
        welcome_configured_char_ids = {
            cid for (cid,) in db.query(Article.template_character_id).filter(
                Article.is_welcome_template == True,  # noqa: E712
                Article.template_character_id.in_(character_ids),
            ).distinct().all()
        }
    greeted_customer_ids: set = set()
    if customer_ids:
        greeted_customer_ids = {
            cid for (cid,) in db.query(Message.customer_id).filter(
                Message.customer_id.in_(customer_ids),
                Message.sender == "character",
            ).distinct().all()
        }

    result = []
    for o in orders:
        character_id = character_id_map.get(o.customer_id)
        is_character_order = o.order_type == "character_creation" and bool(o.customer_id)
        result.append(serialize_order(
            o,
            username_map.get(o.customer_id),
            corrections_map.get(o.customer_id, []),
            requests_map.get(o.customer_id, []),
            bool(o.customer_id) and character_id is None,
            character_id,
            reward_loop_pending=is_character_order and (character_id is None or character_id not in reward_configured_char_ids),
            welcome_page_pending=is_character_order and (character_id is None or character_id not in welcome_configured_char_ids),
            greeting_dm_pending=is_character_order and o.customer_id not in greeted_customer_ids,
        ))
    return result

@router.post("/", status_code=201)
def create_order(data: OrderCreate, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """管理者が手動で受注を追加する（フォーム以外の経路で受けた注文の記録用）"""
    if data.status not in ("new", "in_progress", "delivered"):
        raise HTTPException(status_code=400, detail="不正なステータスです")
    order = Order(
        customer_name=data.customer_name.strip(),
        contact=(data.contact or "").strip() or None,
        character_name=(data.character_name or "").strip() or None,
        grammar_topic=(data.grammar_topic or "").strip() or None,
        status=data.status,
        notes=(data.notes or "").strip() or None,
        form_submitted_at=datetime.utcnow(),
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    logger.info(f"手動で受注を追加しました: order_id={order.id}, customer={order.customer_name}")
    return serialize_order(order)

@router.patch("/{order_id}")
def update_order(order_id: int, data: OrderUpdate, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="受注が見つかりません")
    if data.status is not None and data.status not in ("new", "in_progress", "delivered"):
        raise HTTPException(status_code=400, detail="不正なステータスです")
    # customer_id は None 指定で解除できるため exclude_none は使えない; 個別に処理
    if data.status is not None:
        order.status = data.status
    if data.notes is not None:
        order.notes = data.notes
    if "customer_id" in data.model_fields_set:
        # 明示的に送られた場合のみ更新（null で紐づけ解除）
        if data.customer_id is not None:
            exists = db.query(Customer).filter(Customer.id == data.customer_id).first()
            if not exists:
                raise HTTPException(status_code=400, detail="指定した顧客アカウントが見つかりません")
        order.customer_id = data.customer_id
    db.commit()
    db.refresh(order)

    customer_username = None
    if order.customer_id:
        cu = db.query(Customer).filter(Customer.id == order.customer_id).first()
        customer_username = cu.username if cu else None
    return serialize_order(order, customer_username)


class OrderLinkCustomer(BaseModel):
    customer_id: Optional[int] = None  # null で紐づけ解除


@router.post("/{order_id}/link-customer", tags=["管理者"])
def link_order_to_customer(
    order_id: int,
    data: OrderLinkCustomer,
    admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """受注を顧客アカウントに紐づける（または解除する）。

    受注 → アカウント作成 の対応関係を記録し、
    「この受注がどの顧客アカウントにつながったか」を管理画面で一目で確認できるようにする。
    customer_id = null で紐づけ解除。
    """
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="受注が見つかりません")

    customer_username = None
    if data.customer_id is not None:
        customer = db.query(Customer).filter(Customer.id == data.customer_id).first()
        if not customer:
            raise HTTPException(status_code=400, detail="指定した顧客アカウントが見つかりません")
        customer_username = customer.username
        order.customer_id = data.customer_id
    else:
        order.customer_id = None

    db.commit()
    db.refresh(order)
    action = f"顧客「{customer_username}」に紐づけました" if customer_username else "紐づけを解除しました"
    logger.info(f"受注 order_id={order_id} を {action}")
    return serialize_order(order, customer_username)

@router.delete("/{order_id}")
def delete_order(order_id: int, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """受注を削除（納品済みの整理用）"""
    order = db.query(Order).filter(Order.id == order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="受注が見つかりません")
    db.delete(order)
    db.commit()
    return {"message": "削除しました"}


# ===== 公開申し込みフォーム（認証不要） =====

class PublicFormSubmit(BaseModel):
    """申し込みフォームページからの送信データ"""
    nickname: str
    email: str
    character_name: Optional[str] = None   # "おまかせ" / "[キャラビルダー] 女性/先生/優しい" / "オリジナル定義"
    notes: Optional[str] = None            # キャラクタービルダー詳細 or オリジナル定義テキスト


@router.post("/form-submit", status_code=201, tags=["公開フォーム"])
def submit_public_form(data: PublicFormSubmit, request: Request, db: Session = Depends(get_db)):
    """申し込みフォームページからの送信（認証・Webhook Secret 不要の公開エンドポイント）。

    受け取ったデータを orders テーブルに status="new" で保存する。
    管理画面の「受注管理」タブで確認・対応できる。

    カードテスティング等の悪用対策として、同一IPからの呼び出し回数を制限する。
    """
    enforce_rate_limit(request, "form-submit", limit=5, window_seconds=3600)

    if not data.nickname.strip():
        raise HTTPException(status_code=400, detail="ニックネームは必須です")
    email = data.email.strip()
    if not email:
        raise HTTPException(status_code=400, detail="メールアドレスは必須です")
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="メールアドレスの形式が正しくありません")

    order = Order(
        customer_name=data.nickname.strip(),
        email=email,
        character_name=data.character_name,
        grammar_topic=None,
        notes=data.notes,
        status="new",
        form_submitted_at=datetime.utcnow(),
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    logger.info(
        f"[公開フォーム] 申し込みを受け付けました: "
        f"order_id={order.id}, nickname={order.customer_name}, email={order.email}"
    )
    return {"message": "申し込みを受け付けました", "order_id": order.id}


# ===== 顧客向け（購入履歴・領収書） =====

def _order_description(order: Order) -> str:
    if order.order_type == "credit_purchase":
        return f"クレジット購入：{order.amount_total or 0}クレジット"
    if order.character_name:
        return f"スタータープラン（キャラクター作成＋記事1本）：{order.character_name}"
    return "スタータープラン（キャラクター作成＋記事1本）"


@router.get("/me", tags=["購入履歴（顧客）"])
def list_my_orders(current_user: Customer = Depends(get_current_user), db: Session = Depends(get_db)):
    """ログイン中の顧客自身の購入履歴を取得する。"""
    orders = (
        db.query(Order)
        .filter(Order.customer_id == current_user.id, Order.stripe_payment_status == "paid")
        .order_by(Order.id.desc())
        .all()
    )
    return [
        {
            "id": o.id,
            "created_at": o.created_at.isoformat() if o.created_at else None,
            "description": _order_description(o),
            "amount_total": o.amount_total,
            "currency": o.currency,
            "amount_display": format_amount(o.amount_total, o.currency),
            "refund_status": o.refund_status,
            "stripe_receipt_url": o.stripe_receipt_url,
        }
        for o in orders
    ]


@router.get("/{order_id}/receipt", tags=["購入履歴（顧客）"])
def download_my_receipt(order_id: int, current_user: Customer = Depends(get_current_user), db: Session = Depends(get_db)):
    """ログイン中の顧客自身の購入に対する領収書・請求書PDFをサーバーサイドで生成して返す。"""
    order = (
        db.query(Order)
        .filter(Order.id == order_id, Order.customer_id == current_user.id, Order.stripe_payment_status == "paid")
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="領収書が見つかりません")

    addressee = (current_user.character_memory or {}).get("nickname") or current_user.username

    pdf_bytes = generate_receipt_pdf(
        order_id=order.id,
        issued_at=datetime.utcnow(),
        addressee=addressee,
        description=_order_description(order),
        amount_total=order.amount_total,
        currency=order.currency,
        payment_method="クレジットカード（Stripe）",
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="receipt_{order.id}.pdf"'},
    )
