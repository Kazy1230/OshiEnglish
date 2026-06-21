from sqlalchemy import Column, Integer, String, JSON, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class Character(Base):
    __tablename__ = "characters"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(String(500), nullable=True)
    image_url = Column(String(500), nullable=True)  # AI生成キャラクター画像のパス（/static/character_images/...）
    tone_profile = Column(JSON, nullable=True)   # 口調・性格プロファイル
    color_scheme = Column(JSON, nullable=True)   # UIカラー設定
    font_style = Column(String(100), nullable=True)
    # このキャラクターを所有するクリエイター
    creator_id = Column(Integer, ForeignKey("creator_profiles.id"), nullable=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    customers = relationship("Customer", back_populates="character")
    creator = relationship("CreatorProfile", back_populates="characters")
    courses = relationship("Course", back_populates="character")
