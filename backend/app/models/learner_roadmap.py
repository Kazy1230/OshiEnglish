from sqlalchemy import Column, Integer, Text, JSON, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class LearnerRoadmap(Base):
    """事業検証ポイント②：診断結果からAIが生成するパーソナライズ30日ロードマップ。"""
    __tablename__ = "learner_roadmaps"

    id = Column(Integer, primary_key=True, index=True)
    learner_profile_id = Column(Integer, ForeignKey("learner_profiles.id"), unique=True, nullable=False, index=True)
    level_analysis = Column(JSON, nullable=False)  # current_score/target_score/gap/strengths/weaknesses/predicted_milestone等
    roadmap_reason = Column(Text, nullable=False)  # 「なぜこのロードマップになったのか」
    weekly_plan = Column(JSON, nullable=False)  # 週単位のテーマ・マイルストーン・理由の配列
    day1_tasks = Column(JSON, nullable=False)  # Day1の具体的タスク配列
    creator_message = Column(Text, nullable=False)  # 人格プロファイルを適用したメッセージ
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    learner_profile = relationship("LearnerProfile", back_populates="roadmap")
