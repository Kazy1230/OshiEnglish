from sqlalchemy import Column, Integer, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class MarketingStrategy(Base):
    """クリエイターのマーケティング戦略メモ（1クリエイター1レコード）。"""
    __tablename__ = "marketing_strategies"

    id = Column(Integer, primary_key=True, index=True)
    creator_id = Column(Integer, ForeignKey("creator_profiles.id"), nullable=False, unique=True, index=True)
    content = Column(Text, nullable=True)  # マークダウン形式の戦略メモ
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    creator = relationship("CreatorProfile")
