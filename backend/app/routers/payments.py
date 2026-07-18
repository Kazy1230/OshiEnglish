import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.core.database import get_db
from app.core.config import settings
from app.core.security import get_current_admin, get_current_user
from app.models.customer import Customer
from app.models.course import Course
from app.models.lesson import Lesson
from app.models.purchase import Purchase
from app.models.lesson_progress import LessonProgress
from app.models.course_subscription import CourseSubscription
from app.models.access_extension import AccessExtension
from app.core.access_control import EXTENSION_DAYS, EXTENSION_PRICE_JPY
from app.routers.courses import _is_purchased

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/payments", tags=["決済（Stripe）"])


def _stripe_key_configured() -> bool:
    return bool(settings.STRIPE_SECRET_KEY)


def _get_stripe():
    import stripe

    stripe.api_key = settings.STRIPE_SECRET_KEY
    return stripe


class CourseCheckoutRequest(BaseModel):
    course_id: int


@router.post("/checkout")
def checkout_course(
    data: CourseCheckoutRequest,
    current_user: Customer = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """コース購入用のStripe Payment Intentを作成する。"""
    if current_user.role == "creator":
        raise HTTPException(status_code=403, detail="クリエイターアカウントはコースを購入できません")
    course = db.query(Course).filter(Course.id == data.course_id).first()
    if not course or course.status != "published":
        raise HTTPException(status_code=404, detail="コースが見つかりません")

    if course.is_free:
        raise HTTPException(status_code=400, detail="このコースは無料です")

    existing = db.query(Purchase).filter(
        Purchase.user_id == current_user.id,
        Purchase.course_id == course.id,
        Purchase.status == "succeeded",
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="このコースはすでに購入済みです")

    if settings.PAYMENTS_TEST_MODE:
        purchase = Purchase(
            user_id=current_user.id,
            course_id=course.id,
            amount=course.price,
            stripe_payment_intent_id=f"test_{current_user.id}_{course.id}_{int(datetime.utcnow().timestamp())}",
            status="succeeded",
        )
        db.add(purchase)
        db.commit()
        _grant_lesson_progress(db, purchase)
        return {
            "client_secret": None,
            "test_mode": True,
            "amount": course.price,
            "currency": "jpy",
            "course_title": course.title,
        }

    if not _stripe_key_configured():
        raise HTTPException(status_code=503, detail="決済機能は現在準備中です")

    stripe = _get_stripe()
    idempotency_key = f"{current_user.id}_{course.id}_{int(datetime.utcnow().timestamp())}"
    try:
        intent = stripe.PaymentIntent.create(
            amount=course.price,
            currency="jpy",
            metadata={"user_id": str(current_user.id), "course_id": str(course.id)},
            idempotency_key=idempotency_key,
        )
    except Exception as e:
        logger.exception("[Stripe] コース購入用Payment Intentの作成に失敗しました")
        raise HTTPException(status_code=502, detail="決済処理の作成に失敗しました") from e

    db.add(Purchase(
        user_id=current_user.id,
        course_id=course.id,
        amount=course.price,
        stripe_payment_intent_id=intent.id,
        status="pending",
    ))
    db.commit()

    return {
        "client_secret": intent.client_secret,
        "amount": course.price,
        "currency": "jpy",
        "course_title": course.title,
    }


class ExtendAccessRequest(BaseModel):
    course_id: int


@router.post("/extend-access")
def checkout_access_extension(
    data: ExtendAccessRequest,
    current_user: Customer = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """自由進行型コースのAI/チャット利用期限を90日延長する単発課金(400円)のStripe Payment Intentを作成する。"""
    course = db.query(Course).filter(Course.id == data.course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="コースが見つかりません")
    if course.course_type == "pace_based":
        raise HTTPException(status_code=400, detail="ペース管理型コースは延長できません")
    if not _is_purchased(db, current_user.id, course.id):
        raise HTTPException(status_code=403, detail="このコースを購入していません")

    if settings.PAYMENTS_TEST_MODE:
        ext = AccessExtension(
            user_id=current_user.id,
            course_id=course.id,
            days=EXTENSION_DAYS,
            amount=EXTENSION_PRICE_JPY,
            stripe_payment_intent_id=f"test_ext_{current_user.id}_{course.id}_{int(datetime.utcnow().timestamp())}",
            status="succeeded",
        )
        db.add(ext)
        db.commit()
        return {"client_secret": None, "test_mode": True, "amount": EXTENSION_PRICE_JPY, "currency": "jpy", "days": EXTENSION_DAYS}

    if not _stripe_key_configured():
        raise HTTPException(status_code=503, detail="決済機能は現在準備中です")

    stripe = _get_stripe()
    idempotency_key = f"ext_{current_user.id}_{course.id}_{int(datetime.utcnow().timestamp())}"
    try:
        intent = stripe.PaymentIntent.create(
            amount=EXTENSION_PRICE_JPY,
            currency="jpy",
            metadata={"user_id": str(current_user.id), "course_id": str(course.id), "type": "access_extension"},
            idempotency_key=idempotency_key,
        )
    except Exception as e:
        logger.exception("[Stripe] 利用期限延長用Payment Intentの作成に失敗しました")
        raise HTTPException(status_code=502, detail="決済処理の作成に失敗しました") from e

    db.add(AccessExtension(
        user_id=current_user.id,
        course_id=course.id,
        days=EXTENSION_DAYS,
        amount=EXTENSION_PRICE_JPY,
        stripe_payment_intent_id=intent.id,
        status="pending",
    ))
    db.commit()

    return {"client_secret": intent.client_secret, "amount": EXTENSION_PRICE_JPY, "currency": "jpy", "days": EXTENSION_DAYS}


class CourseSubscribeRequest(BaseModel):
    course_id: int
    tier: str  # "A" / "B"


@router.post("/subscribe")
def subscribe_to_course(
    data: CourseSubscribeRequest,
    current_user: Customer = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """30日伴走コースの月額サブスクリプション（Tier A / Tier B）を開始する。"""
    if current_user.role == "creator":
        raise HTTPException(status_code=403, detail="クリエイターアカウントはコースを購入できません")
    if data.tier not in ("A", "B"):
        raise HTTPException(status_code=400, detail="tier は 'A' または 'B' を指定してください")

    course = db.query(Course).filter(Course.id == data.course_id).first()
    if not course or course.status != "published":
        raise HTTPException(status_code=404, detail="コースが見つかりません")

    price = course.tier_a_price if data.tier == "A" else course.tier_b_price
    if not price:
        raise HTTPException(status_code=400, detail="このコースは指定されたTierに対応していません")

    existing = db.query(CourseSubscription).filter(
        CourseSubscription.user_id == current_user.id,
        CourseSubscription.course_id == course.id,
        CourseSubscription.status.in_(["incomplete", "active", "past_due"]),
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="このコースは既にサブスクリプション登録済みです")

    if settings.PAYMENTS_TEST_MODE:
        db.add(CourseSubscription(
            user_id=current_user.id,
            course_id=course.id,
            tier=data.tier,
            stripe_customer_id=None,
            stripe_subscription_id=None,
            status="active",
        ))
        db.commit()
        return {
            "client_secret": None,
            "test_mode": True,
            "amount": price,
            "currency": "jpy",
            "tier": data.tier,
            "course_title": course.title,
        }

    if not _stripe_key_configured():
        raise HTTPException(status_code=503, detail="決済機能は現在準備中です")

    stripe = _get_stripe()
    try:
        stripe_customer = stripe.Customer.create(
            metadata={"user_id": str(current_user.id)},
            idempotency_key=f"customer_{current_user.id}",
        )
        stripe_product = stripe.Product.create(
            name=f"{course.title}（Tier {data.tier}）",
            idempotency_key=f"product_{course.id}_{data.tier}",
        )
        subscription = stripe.Subscription.create(
            customer=stripe_customer.id,
            items=[{
                "price_data": {
                    "currency": "jpy",
                    "product": stripe_product.id,
                    "unit_amount": price,
                    "recurring": {"interval": "month"},
                },
            }],
            payment_behavior="default_incomplete",
            payment_settings={"save_default_payment_method": "on_subscription"},
            expand=["latest_invoice.payment_intent"],
            metadata={"user_id": str(current_user.id), "course_id": str(course.id), "tier": data.tier},
        )
    except Exception as e:
        logger.exception("[Stripe] サブスクリプションの作成に失敗しました")
        raise HTTPException(status_code=502, detail="決済処理の作成に失敗しました") from e

    db.add(CourseSubscription(
        user_id=current_user.id,
        course_id=course.id,
        tier=data.tier,
        stripe_customer_id=stripe_customer.id,
        stripe_subscription_id=subscription.id,
        status="incomplete",
    ))
    db.commit()

    return {
        "client_secret": subscription.latest_invoice.payment_intent.client_secret,
        "amount": price,
        "currency": "jpy",
        "tier": data.tier,
        "course_title": course.title,
    }


@router.post("/subscriptions/{subscription_id}/cancel")
def cancel_subscription(
    subscription_id: int,
    current_user: Customer = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """学習者が自分のサブスクリプションを即時解約する。"""
    sub = db.query(CourseSubscription).filter(
        CourseSubscription.id == subscription_id, CourseSubscription.user_id == current_user.id
    ).first()
    if not sub:
        raise HTTPException(status_code=404, detail="サブスクリプションが見つかりません")
    if sub.status == "canceled":
        raise HTTPException(status_code=400, detail="既に解約済みです")

    if not settings.PAYMENTS_TEST_MODE:
        if not _stripe_key_configured():
            raise HTTPException(status_code=503, detail="決済機能は現在準備中です")
        stripe = _get_stripe()
        try:
            if sub.stripe_subscription_id:
                stripe.Subscription.delete(sub.stripe_subscription_id)
        except Exception as e:
            logger.exception("[Stripe] サブスクリプションの解約に失敗しました")
            raise HTTPException(status_code=502, detail="解約処理に失敗しました") from e

    sub.status = "canceled"
    db.commit()
    return {"message": "解約処理が完了しました"}


class TierChangeRequest(BaseModel):
    tier: str  # "A" / "B"


@router.post("/subscriptions/{subscription_id}/change-tier")
def change_subscription_tier(
    subscription_id: int,
    data: TierChangeRequest,
    current_user: Customer = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """契約中のTierをアップグレード/ダウングレードする（解約→再契約せず、既存サブスクリプションを更新する）。"""
    if data.tier not in ("A", "B"):
        raise HTTPException(status_code=400, detail="tier は 'A' または 'B' を指定してください")

    sub = db.query(CourseSubscription).filter(
        CourseSubscription.id == subscription_id, CourseSubscription.user_id == current_user.id
    ).first()
    if not sub:
        raise HTTPException(status_code=404, detail="サブスクリプションが見つかりません")
    if sub.status != "active":
        raise HTTPException(status_code=400, detail="アクティブな契約のみTierを変更できます")
    if sub.tier == data.tier:
        raise HTTPException(status_code=400, detail="既に指定されたTierで契約中です")

    course = db.query(Course).filter(Course.id == sub.course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="コースが見つかりません")
    new_price = course.tier_a_price if data.tier == "A" else course.tier_b_price
    if not new_price:
        raise HTTPException(status_code=400, detail="このコースは指定されたTierに対応していません")

    if not settings.PAYMENTS_TEST_MODE:
        if not _stripe_key_configured():
            raise HTTPException(status_code=503, detail="決済機能は現在準備中です")
        if not sub.stripe_subscription_id:
            raise HTTPException(status_code=400, detail="このサブスクリプションは決済情報と紐付いていません")

        stripe = _get_stripe()
        try:
            stripe_sub = stripe.Subscription.retrieve(sub.stripe_subscription_id)
            item_id = stripe_sub["items"]["data"][0]["id"]
            stripe_product = stripe.Product.create(
                name=f"{course.title}（Tier {data.tier}）",
                idempotency_key=f"product_{course.id}_{data.tier}",
            )
            stripe.Subscription.modify(
                sub.stripe_subscription_id,
                items=[{
                    "id": item_id,
                    "price_data": {
                        "currency": "jpy",
                        "product": stripe_product.id,
                        "unit_amount": new_price,
                        "recurring": {"interval": "month"},
                    },
                }],
                proration_behavior="create_prorations",
            )
        except Exception as e:
            logger.exception("[Stripe] サブスクリプションのTier変更に失敗しました")
            raise HTTPException(status_code=502, detail="Tier変更処理に失敗しました") from e

    sub.tier = data.tier
    db.commit()
    return {"message": f"Tier {data.tier}に変更しました", "tier": data.tier}


def _grant_lesson_progress(db: Session, purchase: Purchase):
    """購入済みコースの全レッスンに学習進捗レコードを用意する（未受講状態で作成、冪等）"""
    lessons = db.query(Lesson).filter(Lesson.course_id == purchase.course_id).all()
    for lesson in lessons:
        existing_progress = db.query(LessonProgress).filter(
            LessonProgress.user_id == purchase.user_id,
            LessonProgress.lesson_id == lesson.id,
        ).first()
        if not existing_progress:
            db.add(LessonProgress(user_id=purchase.user_id, lesson_id=lesson.id, is_completed=False))
    db.commit()


def _handle_course_payment_succeeded(db: Session, payment_intent: dict):
    """payment_intent.succeeded を処理し、コース購入を完了させる（冪等）"""
    purchase = db.query(Purchase).filter(
        Purchase.stripe_payment_intent_id == payment_intent.get("id")
    ).first()
    if not purchase or purchase.status == "succeeded":
        return

    purchase.status = "succeeded"
    db.flush()
    _grant_lesson_progress(db, purchase)
    logger.info(f"[Stripe] コース購入が完了しました: purchase_id={purchase.id}, course_id={purchase.course_id}")


def _handle_course_payment_failed(db: Session, payment_intent: dict):
    """payment_intent.payment_failed を処理する（冪等）"""
    purchase = db.query(Purchase).filter(
        Purchase.stripe_payment_intent_id == payment_intent.get("id")
    ).first()
    if not purchase or purchase.status != "pending":
        return
    purchase.status = "failed"
    db.commit()


def _handle_extension_payment_succeeded(db: Session, payment_intent: dict):
    """payment_intent.succeeded を処理し、利用期限延長を確定させる（冪等）"""
    ext = db.query(AccessExtension).filter(
        AccessExtension.stripe_payment_intent_id == payment_intent.get("id")
    ).first()
    if not ext or ext.status == "succeeded":
        return
    ext.status = "succeeded"
    db.commit()
    logger.info(f"[Stripe] 利用期限延長が完了しました: extension_id={ext.id}, course_id={ext.course_id}")


def _handle_extension_payment_failed(db: Session, payment_intent: dict):
    """payment_intent.payment_failed を処理する（冪等）"""
    ext = db.query(AccessExtension).filter(
        AccessExtension.stripe_payment_intent_id == payment_intent.get("id")
    ).first()
    if not ext or ext.status != "pending":
        return
    ext.status = "failed"
    db.commit()


def _handle_subscription_updated(db: Session, subscription: dict):
    """customer.subscription.updated / invoice.payment_succeeded を処理する（冪等）"""
    sub = db.query(CourseSubscription).filter(
        CourseSubscription.stripe_subscription_id == subscription.get("id")
    ).first()
    if not sub:
        return
    status_map = {"active": "active", "trialing": "active", "past_due": "past_due", "canceled": "canceled", "unpaid": "past_due", "incomplete": "incomplete", "incomplete_expired": "canceled"}
    new_status = status_map.get(subscription.get("status"), sub.status)
    if new_status == "past_due" and sub.status != "past_due":
        sub.past_due_since = datetime.now(timezone.utc)
    elif new_status == "active":
        sub.past_due_since = None
    sub.status = new_status
    period_end = subscription.get("current_period_end")
    if period_end:
        sub.current_period_end = datetime.utcfromtimestamp(period_end)
    db.commit()
    logger.info(f"[Stripe] サブスクリプション状態を更新しました: subscription_id={sub.id}, status={sub.status}")


def _handle_subscription_deleted(db: Session, subscription: dict):
    """customer.subscription.deleted を処理する（冪等）"""
    sub = db.query(CourseSubscription).filter(
        CourseSubscription.stripe_subscription_id == subscription.get("id")
    ).first()
    if not sub:
        return
    sub.status = "canceled"
    db.commit()


@router.post("/webhook")
async def stripe_webhook(request: Request, db: Session = Depends(get_db)):
    if not _stripe_key_configured() or not settings.STRIPE_WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="決済機能は現在準備中です")

    stripe = _get_stripe()
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    try:
        event = stripe.Webhook.construct_event(payload, sig_header, settings.STRIPE_WEBHOOK_SECRET)
    except (ValueError, Exception) as e:
        logger.warning(f"[Stripe] Webhook検証に失敗しました: {e}")
        raise HTTPException(status_code=400, detail="不正なWebhookです")

    if event["type"] == "payment_intent.succeeded":
        _handle_course_payment_succeeded(db, event["data"]["object"])
        _handle_extension_payment_succeeded(db, event["data"]["object"])
    elif event["type"] == "payment_intent.payment_failed":
        _handle_course_payment_failed(db, event["data"]["object"])
        _handle_extension_payment_failed(db, event["data"]["object"])
    elif event["type"] in ("customer.subscription.updated", "customer.subscription.created"):
        _handle_subscription_updated(db, event["data"]["object"])
    elif event["type"] == "customer.subscription.deleted":
        _handle_subscription_deleted(db, event["data"]["object"])
    elif event["type"] == "invoice.payment_succeeded":
        subscription_id = event["data"]["object"].get("subscription")
        if subscription_id:
            _handle_subscription_updated(db, {"id": subscription_id, "status": "active"})

    return {"received": True}


@router.post("/refund/{purchase_id}")
def refund_purchase(purchase_id: int, admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    """管理者がコース購入をStripe経由で全額返金する。"""
    purchase = db.query(Purchase).filter(Purchase.id == purchase_id).first()
    if not purchase:
        raise HTTPException(status_code=404, detail="購入情報が見つかりません")

    if purchase.status != "succeeded":
        raise HTTPException(status_code=400, detail="返金対象の決済が見つかりません")

    if not _stripe_key_configured():
        raise HTTPException(status_code=503, detail="決済機能は現在準備中です")

    stripe = _get_stripe()
    try:
        stripe.Refund.create(payment_intent=purchase.stripe_payment_intent_id)
    except Exception as e:
        logger.exception("[Stripe] 返金処理に失敗しました")
        raise HTTPException(status_code=502, detail="返金処理に失敗しました") from e

    purchase.status = "refunded"
    db.commit()

    return {"message": "返金処理が完了しました"}
