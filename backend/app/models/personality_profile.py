from sqlalchemy import Column, Integer, JSON, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class PersonalityProfile(Base):
    """AIインタビューで抽出したクリエイターの人格プロファイル。

    courses.personality_profile_id から参照され、コース生成・日次伴走チャット・
    Tier B AI下書き生成のシステムプロンプトに織り込まれる（事業の中核データ）。
    """
    __tablename__ = "personality_profiles"

    id = Column(Integer, primary_key=True, index=True)
    creator_id = Column(Integer, ForeignKey("creator_profiles.id"), unique=True, nullable=False, index=True)
    interview_answers = Column(JSON, nullable=True)  # 質問と回答のペア配列（深掘り含む全履歴）
    profile = Column(JSON, nullable=True)  # 抽出された人格プロファイル構造体（communication/coaching_style/learning_philosophy/thinking_style）
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    creator = relationship("CreatorProfile", back_populates="personality_profile")
