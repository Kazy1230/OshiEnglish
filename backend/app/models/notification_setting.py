from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from app.core.database import Base


class NotificationSetting(Base):
    """学習者が設定する朝・夜の通知時刻（コースごと）。"""
    __tablename__ = "notification_settings"
    __table_args__ = (
        UniqueConstraint("user_id", "course_id", name="uq_notification_settings_user_course"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)
    morning_time = Column(String(5), nullable=False, default="07:00")
    evening_time = Column(String(5), nullable=False, default="21:00")
    is_enabled = Column(Boolean, nullable=False, default=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
