from sqlalchemy import Column, Integer, String, Text, JSON, DateTime, ForeignKey
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
    base_type = Column(String(50), nullable=True)  # Step0で選んだ指導スタイルのプリセット（共感型/指導型/激励型/厳格型）
    gender = Column(String(20), nullable=True)  # Step0で選んだキャラクターの性別（男性/女性/中性的）
    # クリエイター紹介ページの「会話のイメージ」に表示するサンプル返信。
    # 固定の学習者セリフ（「最近やる気が出なくて、続けられるか不安です…」）に対し、
    # この人格プロファイルの口調で実際に返すであろう一言をAI生成して保存する（1回生成・保存方式）
    sample_reply = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    creator = relationship("CreatorProfile", back_populates="personality_profile")
