from sqlalchemy import Column, Integer, String, Text, JSON, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class CourseDay(Base):
    """90日伴走コースの日単位コンテンツ（AI生成→クリエイターが日単位で確認・編集する）。"""
    __tablename__ = "course_days"
    __table_args__ = (
        UniqueConstraint("course_id", "day_number", name="uq_course_days_course_day"),
    )

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)
    day_number = Column(Integer, nullable=False)  # 1〜90
    week_number = Column(Integer, nullable=False)  # 1〜13
    theme = Column(String(255), nullable=True)
    tasks = Column(JSON, nullable=True)  # タスクリスト（文字列配列）
    ai_message_morning = Column(Text, nullable=True)
    ai_message_evening = Column(Text, nullable=True)
    ai_message_completion = Column(Text, nullable=True)
    is_rest_day = Column(Boolean, nullable=False, default=False)
    is_edited_by_creator = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    course = relationship("Course", back_populates="days")
