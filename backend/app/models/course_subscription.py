from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class CourseSubscription(Base):
    """90日伴走コースの月額サブスクリプション（Tier A / Tier B）。

    解約後の再契約で履歴として複数行が残るため、(user_id, course_id)へのUNIQUE制約は持たない。
    同時に有効な契約が1件だけであることはアプリケーション側（subscribe_to_courseの存在チェック）で保証する。
    """
    __tablename__ = "course_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)
    tier = Column(String(1), nullable=False)  # "A" / "B"
    stripe_customer_id = Column(String(255), nullable=True)
    stripe_subscription_id = Column(String(255), nullable=True, index=True)
    # incomplete(決済待ち) / active / past_due / canceled
    status = Column(String(20), nullable=False, default="incomplete")
    current_period_end = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("Customer")
    course = relationship("Course", back_populates="subscriptions")
