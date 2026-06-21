from sqlalchemy import Column, Integer, String, Text, JSON, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class ContentDraft(Base):
    """AIコンテンツ生成スタジオの二段階生成(素材生成→口調変換→台本)の途中経過を保存する下書き。"""
    __tablename__ = "content_drafts"

    id = Column(Integer, primary_key=True, index=True)
    creator_id = Column(Integer, ForeignKey("creator_profiles.id"), nullable=True, index=True)
    character_id = Column(Integer, ForeignKey("characters.id"), nullable=True, index=True)
    theme = Column(String(255), nullable=False)
    structure = Column(JSON, nullable=True)  # 構成案(セクション見出しのリスト)
    target_level = Column(String(50), nullable=True)
    raw_content = Column(Text, nullable=True)  # Step2: 素材生成結果
    voiced_content = Column(Text, nullable=True)  # Step3: 口調変換結果
    script_content = Column(Text, nullable=True)  # Step4: 台本生成結果
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    creator = relationship("CreatorProfile")
    character = relationship("Character")
