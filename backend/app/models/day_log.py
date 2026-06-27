from sqlalchemy import Column, Integer, Boolean, Text, JSON, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from app.core.database import Base


class DayLog(Base):
    """学習者の日次学習ログ（Day1〜30の完了状況）。"""
    __tablename__ = "day_logs"
    __table_args__ = (
        UniqueConstraint("user_id", "course_id", "day_number", name="uq_day_logs_user_course_day"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)
    day_number = Column(Integer, nullable=False)
    is_completed = Column(Boolean, nullable=False, default=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    memo = Column(Text, nullable=True)
    # 実際に完了したタスク種別（議論サマリー15節の繰越タスク計算に使用）。未指定（null）の場合は全タスク完了とみなす
    completed_task_types = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
