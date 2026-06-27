from sqlalchemy import Column, Integer, Text, JSON, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from app.core.database import Base


class LearnerCourseDay(Base):
    """Layer2: 学習者ごとに個人化された30日タスク配分。Day1診断完了直後に1回生成する。"""
    __tablename__ = "learner_course_days"
    __table_args__ = (
        UniqueConstraint("learner_profile_id", "day_number", name="uq_learner_course_days_profile_day"),
    )

    id = Column(Integer, primary_key=True, index=True)
    learner_profile_id = Column(Integer, ForeignKey("learner_profiles.id"), nullable=False, index=True)
    day_number = Column(Integer, nullable=False)  # 1〜30
    adjusted_tasks = Column(JSON, nullable=False)  # 例: [{"type": "vocabulary", "minutes": 15}]
    personalize_reason = Column(Text, nullable=True)
    # 前日に未完了だったタスクの繰越（議論サマリー15節）。例: [{"type": "vocabulary", "minutes": 10, "carryover_from_day": 5}]
    carryover_tasks = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
