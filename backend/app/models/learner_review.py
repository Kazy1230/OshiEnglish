from sqlalchemy import Column, Integer, String, JSON, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from app.core.database import Base


class LearnerReview(Base):
    """学習者の週次・月次レビュー（要件定義書5.5）。AIが学習ログを分析して生成する。"""
    __tablename__ = "learner_reviews"
    __table_args__ = (
        UniqueConstraint("user_id", "course_id", "review_type", "period_number", name="uq_learner_reviews_period"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)
    review_type = Column(String(10), nullable=False)  # weekly / monthly
    period_number = Column(Integer, nullable=False)  # weekly: 1〜13週, monthly: 1〜3ヶ月
    content = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
