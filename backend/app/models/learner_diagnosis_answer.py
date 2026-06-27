from sqlalchemy import Column, Integer, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from app.core.database import Base


class LearnerDiagnosisAnswer(Base):
    """Day1診断で学習者が回答したカスタム質問への回答。"""
    __tablename__ = "learner_diagnosis_answers"
    __table_args__ = (
        UniqueConstraint("learner_profile_id", "question_id", name="uq_learner_diagnosis_answer"),
    )

    id = Column(Integer, primary_key=True, index=True)
    learner_profile_id = Column(Integer, ForeignKey("learner_profiles.id"), nullable=False, index=True)
    question_id = Column(Integer, ForeignKey("course_diagnosis_questions.id"), nullable=False, index=True)
    answer = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
