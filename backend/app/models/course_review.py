from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, UniqueConstraint, CheckConstraint
from sqlalchemy.sql import func
from app.core.database import Base


class CourseReview(Base):
    """学習者によるコースレビュー（2軸評価: 講座内容 + AIコーチング）。"""
    __tablename__ = "course_reviews"
    __table_args__ = (
        UniqueConstraint("user_id", "course_id", name="uq_course_reviews_user_course"),
        CheckConstraint("content_rating BETWEEN 1 AND 5", name="ck_content_rating"),
        CheckConstraint("coaching_rating BETWEEN 1 AND 5", name="ck_coaching_rating"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)
    content_rating = Column(Integer, nullable=False)   # 1〜5: 講座内容の評価
    coaching_rating = Column(Integer, nullable=False)  # 1〜5: AIコーチングの評価
    body = Column(Text, nullable=True)                 # 自由記述
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
