from sqlalchemy import Column, Integer, String, JSON, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class InterviewSession(Base):
    """AIインタビュー（人格収集）の進行状態。ブラウザを閉じても続きから再開できるよう保存する。"""
    __tablename__ = "interview_sessions"

    id = Column(Integer, primary_key=True, index=True)
    creator_id = Column(Integer, ForeignKey("creator_profiles.id"), unique=True, nullable=False, index=True)
    fixed_index = Column(Integer, nullable=False, default=0)  # 次に出す固定質問のインデックス（0〜4）
    follow_up_count = Column(Integer, nullable=False, default=0)  # 深掘り質問の使用数（最大3）
    pending_question = Column(String(1000), nullable=True)  # 直近にAIが提示した質問文（回答待ち）
    subject = Column(String(100), nullable=True)
    base_type = Column(String(50), nullable=True)  # Step0で選んだ指導スタイルのプリセット（共感型/指導型/激励型/厳格型）
    gender = Column(String(20), nullable=True)  # Step0で選んだキャラクターの性別（男性/女性/中性的）
    qa_history = Column(JSON, nullable=True)  # [{question, answer, is_followup}] の配列
    status = Column(String(20), nullable=False, default="in_progress")  # in_progress / completed
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    creator = relationship("CreatorProfile", back_populates="interview_session")
