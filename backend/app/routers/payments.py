import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.core.config import settings
from app.core.security import hash_password, get_current_admin
from app.core.credentials import generate_temp_password, generate_username
from app.core.intimacy import get_intimacy_settings
from app.core.rewards import check_and_unlock_rewards
from app.core.email import send_email
from app.core.rate_limit import enforce_rate_limit
from app.core.welcome_articles import claim_welcome_article_for_customer
from app.models.order import Order
from app.models.customer import Customer
from app.models.character import Character

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/payments", tags=["決済（Stripe）"])


def _stripe_configured() -> bool:
    return bool(settings.STRIPE_SECRET_KEY and settings.STRIPE_PRICE_ID)


def _get_stripe():
    import stripe

    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


class CreateCheckoutSessionRequest(BaseModel):
    order_id: int


def _get_preset_character(db: Session, order: Order):
    """注文のキャラクター選択が公式キャラ（is_preset）に一致する場合、そのCharacterを返す"""
    if not order.character_name:
        return None
    return db.query(Character).filter(
        Character.is_preset == True,  # noqa: E712
        Character.name == order.character_name,
    ).first()


@router.post("/create-checkout-session", tags=["公開フォーム"])
def create_checkout_session(data: CreateCheckoutSessionRequest, request: Request, db: Session = Depends(get_db)):
    """申し込みフォーム送信後、決済画面（Stripe Checkout）へのURLを発行する。

    公式キャラクターを選択した場合はキャラ作成費用が無料のため、Stripe決済を行わず
    その場でアカウントを発行する。
    Stripeが未設定の場合（公式キャラ以外）は503を返し、フロントエンドは従来のDM案内にフォールバックする。

    カードテスティング等の悪用対策として、同一IPからの呼び出し回数を制限する。
    """
    enforce_rate_limit(request, "create-checkout-session", limit=10, window_seconds=3600)

    order = db.query(Order).filter(Order.id == data.order_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="申し込み情報が見つかりません")

    if _get_preset_character(db, order):
        return _issue_free_account_for_preset(db, order)

    if not _stripe_configured():
        raise HTTPException(status_code=503, detail="決済機能は現在準備中です")

    stripe = _get_stripe()
    try:
        session = stripe.checkout.Session.create(
            mode="payment",
            line_items=[{"price": settings.STRIPE_PRICE_ID, "quantity": 1}],
            customer_email=order.email or None,
            # Stripeの自動領収書・請求書発行機能を有効化する
            invoice_creation={"enabled": True},
            success_url=f"{settings.FRONTEND_URL}/apply/complete?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{settings.FRONTEND_URL}/apply",
            metadata={"order_id": str(order.id)},
        )
    except Exception as e:
        logger.exception("Stripe Checkout Session の作成に失敗しました")
        raise HTTPException(status_code=502, detail="決済画面の作成に失敗しました") from e

    order.stripe_session_id = session.id
    db.commit()

    return {"checkout_url": session.url}


def _issue_account(db: Session, order: Order):
    """注文に対してアカウントを自動発行する（共通処理）。

    呼び出し前に order.stripe_session_id / stripe_payment_status / stripe_payment_intent_id /
    amount_total / currency / stripe_invoice_id を設定しておくこと。
    """
    # アカウントIDはメールアドレスをそのまま使う（ランダム文字列だと顧客が覚えられないため）。
    # 同じメールアドレスで既にアカウントが存在する場合（再購入等）は、衝突回避のためランダム生成にフォールバックする。
    username = order.email
    if not username or db.query(Customer).filter(Customer.username == username).first():
        username = generate_username()
        while db.query(Customer).filter(Customer.username == username).first():
            username = generate_username()
    password = generate_temp_password()

    customer = Customer(
        username=username,
        hashed_password=hash_password(password),
        email=order.email,
        is_password_reset_required=True,
        subscription_plan="buy_once",
        # username（ログインID）はメールアドレスのため、キャラクターが呼ぶ名前・
        # 記事生成プロンプトには申込フォームで入力された呼び名（nickname）を使う
        character_memory={"nickname": order.customer_name} if order.customer_name else None,
    )
    db.add(customer)
    db.flush()

    settings_row = get_intimacy_settings(db)
    customer.intimacy_points = (customer.intimacy_points or 0) + settings_row.points_per_purchase

    preset_character = _get_preset_character(db, order)
    if preset_character:
        # 公式キャラクターを選択した場合は、即日チャット開始できるようそのキャラクターを直接割り当てる
        customer.character_id = preset_character.id
    else:
        # 公式キャラ以外（オーダーメイド）の場合は character_id を割り当てない。
        # 顧客専用のキャラクターは後ほど運営者がLLM下書き＋承認のうえ作成し、
        # customers.character_id を更新して案内メールを送る（PATCH /customers/{id}）。
        # その間も本棚が空のままにならないよう、汎用ウェルカム記事を先に届けておく。
        claim_welcome_article_for_customer(db, customer)

    check_and_unlock_rewards(db, customer)

    order.customer_id = customer.id
    order.status = "in_progress"
    order.issued_username = username
    order.issued_password = password
    order.credentials_viewed = False

    # Stripeの自動領収書URLを取得する（PaymentIntent経由でCharge情報を展開）
    if order.stripe_payment_intent_id:
        try:
            stripe = _get_stripe()
            pi = stripe.PaymentIntent.retrieve(order.stripe_payment_intent_id, expand=["latest_charge"])
            charge = pi.get("latest_charge")
            if charge:
                order.stripe_receipt_url = charge.get("receipt_url")
        except Exception:
            logger.exception("[Stripe] 領収書URLの取得に失敗しました")

    db.commit()
    logger.info(f"[Stripe] アカウントを自動発行しました: order_id={order.id}, username={username}")

    if order.email:
        receipt_line = (
            f'<p>領収書はこちらからご確認いただけます: <a href="{order.stripe_receipt_url}">{order.stripe_receipt_url}</a></p>'
            if order.stripe_receipt_url else ""
        )
        send_email(
            to=order.email,
            subject="【推しEnglish】アカウント情報のお知らせ",
            html=(
                f"<p>{order.customer_name} 様</p>"
                "<p>お申し込み・お支払いありがとうございます。以下のアカウント情報でログインしてください。</p>"
                f"<p>ユーザー名: <b>{username}</b><br>仮パスワード: <b>{password}</b></p>"
                "<p>このID/PWは完了画面でも一度だけ表示されます。初回ログイン時にパスワードの変更をお願いします。</p>"
                f'<p><a href="{settings.FRONTEND_URL}/login">ログインはこちら</a></p>'
                "<p>ログイン後、アプリ内チャットからすぐにキャラクターとやり取りできます。</p>"
                f"{receipt_line}"
                "<p>領収書・請求書はマイページの購入履歴からもダウンロードいただけます。</p>"
            ),
        )


def _issue_free_account_for_preset(db: Session, order: Order):
    """公式キャラクターはキャラ作成費用が無料のため、Stripe決済をスキップしてアカウントを即時発行する。"""
    if order.customer_id and order.stripe_session_id:
        # 既に発行済み（フロントエンドの再呼び出し対策）
        return {"checkout_url": f"{settings.FRONTEND_URL}/apply/complete?session_id={order.stripe_session_id}"}

    session_id = f"free_{uuid.uuid4().hex}"
    order.stripe_session_id = session_id
    order.stripe_payment_status = "paid"
    order.stripe_payment_intent_id = None
    order.amount_total = 0
    order.currency = "jpy"
    order.stripe_invoice_id = None

    _issue_account(db, order)

    return {"checkout_url": f"{settings.FRONTEND_URL}/apply/complete?session_id={session_id}"}


def _handle_checkout_completed(db: Session, session: dict):
    """checkout.session.completed を処理し、アカウントを自動発行する（冪等）"""
    order = db.query(Order).filter(Order.stripe_session_id == session.get("id")).first()
    if not order:
        logger.warning(f"[Stripe] 対応する受注が見つかりません: session_id={session.get('id')}")
        return

    # 既にアカウント発行済みなら何もしない（Webhook再送対策）
    if order.customer_id:
        return

    order.stripe_payment_status = "paid"
    order.stripe_payment_intent_id = session.get("payment_intent")
    order.amount_total = session.get("amount_total")
    order.currency = session.get("currency")
    order.stripe_invoice_id = session.get("invoice")

    _issue_account(db, order)


@router.post("/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    if not _stripe_configured() or not settings.STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="決済機能は現在準備中です")

    stripe = _get_stripe()
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, settings.STRIPE_WEBHOOK_SECRET)
    except (ValueError, Exception) as e:
        logger.warning(f"[Stripe] Webhook検証に失敗しました: {e}")
        raise HTTPException(status_code=400, detail="不正なWebhookです")

    if event["type"] == "checkout.session.completed":
        _handle_checkout_completed(db, event["data"]["object"])

    return {"received": True}


@router.get("/session/{session_id}", tags=["公開フォーム"])
def get_payment_session(session_id: str, db: Session = Depends(get_db)):
    """決済完了画面から、自動発行されたアカウント情報を一度だけ取得する。"""
    order = db.query(Order).filter(Order.stripe_session_id == session_id).first()
    if not order:
        raise HTTPException(status_code=404, detail="決済情報が見つかりません")

    if order.stripe_payment_status != "paid":
        return {"status": "processing"}

    if order.credentials_viewed:
        return {"status": "already_viewed"}

    order.credentials_viewed = True
    password = order.issued_password
    order.issued_password = None
    db.commit()

    return {
        "status": "issued",
        "username": order.issued_username,
        "temporary_password": password,
    }


@router.post("/refund/{customer_id}")
def refund_customer(customer_id: int, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """管理者が顧客の決済をStripe経由で全額返金する。

    返金・解約ポリシー: キャラ作成完了前（注文ステータスが"delivered"になる前）であれば全額返金可能。
    コンテンツ提供済み（"delivered"）の場合は返金不可。
    """
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="顧客が見つかりません")

    order = (
        db.query(Order)
        .filter(Order.customer_id == customer_id, Order.stripe_payment_status == "paid")
        .order_by(Order.id.desc())
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="返金対象の決済情報が見つかりません")

    if order.refund_status == "refunded":
        raise HTTPException(status_code=400, detail="この注文はすでに返金済みです")

    if order.status == "delivered":
        raise HTTPException(status_code=400, detail="コンテンツ提供済みのため返金できません")

    if not order.stripe_payment_intent_id:
        raise HTTPException(status_code=400, detail="返金対象の決済情報が見つかりません")

    if not _stripe_configured():
        raise HTTPException(status_code=503, detail="決済機能は現在準備中です")

    stripe = _get_stripe()
    try:
        stripe.Refund.create(payment_intent=order.stripe_payment_intent_id)
    except Exception as e:
        logger.exception("[Stripe] 返金処理に失敗しました")
        raise HTTPException(status_code=502, detail="返金処理に失敗しました") from e

    order.refund_status = "refunded"
    order.refunded_at = datetime.utcnow()
    db.commit()

    if customer.email:
        send_email(
            to=customer.email,
            subject="【推しEnglish】返金完了のお知らせ",
            html=(
                f"<p>{customer.username} 様</p>"
                "<p>ご請求いただいた料金について、返金処理が完了しました。</p>"
                "<p>返金の反映には、ご利用のカード会社により数営業日ほどかかる場合があります。</p>"
            ),
        )

    return {"message": "返金処理が完了しました"}
