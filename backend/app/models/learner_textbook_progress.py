from sqlalchemy import Column, Integer, Numeric, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from app.core.database import Base


class LearnerTextbookProgress(Base):
    """学習者が申し込み時（Day1診断）に入力した、コース教材ごとの現在進捗。
    current_progressは「1周=100%」単位の累計値（例: 目標2周中、1周目の40%済みなら40.00）。
    target_laps(CourseTextbook側)×100が完了条件の総量となり、Layer2で残タスク量の計算に使う。"""
    __tablename__ = "learner_textbook_progress"
    __table_args__ = (
        UniqueConstraint("learner_profile_id", "course_textbook_id", name="uq_learner_textbook_progress"),
    )

    id = Column(Integer, primary_key=True, index=True)
    learner_profile_id = Column(Integer, ForeignKey("learner_profiles.id"), nullable=False, index=True)
    course_textbook_id = Column(Integer, ForeignKey("course_textbooks.id"), nullable=False, index=True)
    current_progress = Column(Numeric(5, 2), nullable=False, default=0)  # 0.00〜（target_laps*100まで）
    note = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
