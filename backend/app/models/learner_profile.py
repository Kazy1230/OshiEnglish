from sqlalchemy import Column, Integer, String, Text, JSON, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class LearnerProfile(Base):
    """Day1初回診断チャット（7問）の回答結果。コースごとに1件。"""
    __tablename__ = "learner_profiles"
    __table_args__ = (
        UniqueConstraint("user_id", "course_id", name="uq_learner_profiles_user_course"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)
    current_score = Column(Integer, nullable=True)  # Q1（未受験の場合はNULL）
    target_score = Column(Integer, nullable=False)  # Q2
    exam_date = Column(String(50), nullable=False)  # Q3（選択肢の文字列）
    daily_study_time = Column(String(50), nullable=False)  # Q4（選択肢の文字列）
    weak_areas = Column(JSON, nullable=False)  # Q5（複数選択、文字列配列）
    study_history = Column(Text, nullable=True)  # Q6
    materials = Column(Text, nullable=True)  # Q7（任意）
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    roadmap = relationship("LearnerRoadmap", back_populates="learner_profile", uselist=False)
