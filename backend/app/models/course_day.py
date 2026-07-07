from sqlalchemy import Column, Integer, String, Text, JSON, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class CourseDay(Base):
    """30日伴走コースの概念コース骨格（Layer1。クリエイターが1回だけ生成、全学習者共通）。
    メッセージ文は持たない（Layer3で都度生成）。チェックリスト項目（text・minutes）のリストを持つ。"""
    __tablename__ = "course_days"
    __table_args__ = (
        UniqueConstraint("course_id", "day_number", name="uq_course_days_course_day"),
    )

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)
    day_number = Column(Integer, nullable=False)  # 1〜30
    week_number = Column(Integer, nullable=False)  # 1〜4
    theme = Column(String(255), nullable=True)
    # 例: [{"text": "単語30語を暗記する", "minutes": 15}]
    checklist_items = Column(JSON, nullable=True)
    is_rest_day = Column(Boolean, nullable=False, default=False)
    is_edited_by_creator = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    course = relationship("Course", foreign_keys=[course_id])
