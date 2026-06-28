from sqlalchemy import Column, Integer, String, Text, JSON, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class LearnerProfile(Base):
    """Day1初回診断の回答結果。コースごとに1件。質問本体はクリエイターのカスタム質問
    （CourseDiagnosisQuestion/LearnerDiagnosisAnswer）で管理する。"""
    __tablename__ = "learner_profiles"
    __table_args__ = (
        UniqueConstraint("user_id", "course_id", name="uq_learner_profiles_user_course"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)
    # 以下4項目は固定7問の名残（廃止済み）。クリエイターのカスタム質問のみで診断する現在は使用しない
    current_score = Column(Integer, nullable=True)
    target_score = Column(Integer, nullable=True)
    exam_date = Column(String(50), nullable=True)
    daily_study_time = Column(String(50), nullable=True)
    weak_areas = Column(JSON, nullable=True)
    study_history = Column(Text, nullable=True)  # Q6
    materials = Column(Text, nullable=True)  # Q7（任意）
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    roadmap = relationship("LearnerRoadmap", back_populates="learner_profile", uselist=False)
