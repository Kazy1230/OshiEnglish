"""コース購入後の「インタラクション利用期限」を扱う共通ロジック。

ペース管理型(30日伴走)コースは30日間の固定プログラムのため、30日を過ぎたら
延長なしでインタラクション（チャット・日次記録）が使えなくなる。
自由進行型コースはカリキュラム自体はいつでも閲覧できるが、TierA/BのAIチャット・
Tier Bの直接質問・課題提出時のAIコメントは90日で使えなくなる（400円で90日延長可能）。
"""
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.purchase import Purchase
from app.models.course_subscription import CourseSubscription
from app.models.access_extension import AccessExtension
from app.models.course import Course

PACE_BASED_INTERACTION_DAYS = 30
SELF_PACED_INTERACTION_DAYS = 90
EXTENSION_DAYS = 90
EXTENSION_PRICE_JPY = 400


def get_access_start_date(db: Session, user_id: int, course_id: int) -> datetime | None:
    """コースの利用開始日時（購入または契約開始のうち最も古いもの）を返す。"""
    purchase = db.query(Purchase).filter(
        Purchase.user_id == user_id, Purchase.course_id == course_id, Purchase.status == "succeeded",
    ).order_by(Purchase.purchased_at).first()
    subscription = db.query(CourseSubscription).filter(
        CourseSubscription.user_id == user_id, CourseSubscription.course_id == course_id,
        CourseSubscription.status.in_(["active", "past_due", "incomplete", "canceled"]),
    ).order_by(CourseSubscription.created_at).first()
    candidates = [d for d in (
        purchase.purchased_at if purchase else None,
        subscription.created_at if subscription else None,
    ) if d]
    if not candidates:
        return None
    start = min(candidates)
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    return start


def _extension_days_purchased(db: Session, user_id: int, course_id: int) -> int:
    total = db.query(func.coalesce(func.sum(AccessExtension.days), 0)).filter(
        AccessExtension.user_id == user_id, AccessExtension.course_id == course_id,
        AccessExtension.status == "succeeded",
    ).scalar()
    return int(total or 0)


def get_interaction_deadline(db: Session, user_id: int, course_id: int, course: Course) -> datetime | None:
    """チャット・AI機能等のインタラクションが利用できる期限を返す。開始日が無ければNone(無期限)。"""
    start = get_access_start_date(db, user_id, course_id)
    if not start:
        return None
    base_days = PACE_BASED_INTERACTION_DAYS if course.course_type == "pace_based" else SELF_PACED_INTERACTION_DAYS
    extension_days = 0 if course.course_type == "pace_based" else _extension_days_purchased(db, user_id, course_id)
    return start + timedelta(days=base_days + extension_days)


def is_interaction_expired(db: Session, user_id: int, course_id: int, course: Course) -> bool:
    deadline = get_interaction_deadline(db, user_id, course_id, course)
    if deadline is None:
        return False
    return datetime.now(timezone.utc) >= deadline
