from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from app.core.database import Base


class CreatorContent(Base):
    """クリエイターが投稿したコンテンツ（URL保存・OGP情報キャッシュ）。"""
    __tablename__ = "creator_contents"

    id = Column(Integer, primary_key=True, index=True)
    creator_id = Column(Integer, ForeignKey("creator_profiles.id"), nullable=False, index=True)
    url = Column(String(2048), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    thumbnail_url = Column(String(2048), nullable=True)
    content_type = Column(String(50), nullable=False)  # youtube / x / instagram / threads / tiktok / note / other
    subject = Column(String(20), nullable=False, default="english")
    tags = Column(JSON, nullable=True)  # list[str]
    is_public = Column(Boolean, nullable=False, default=True)
    like_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    creator = relationship("CreatorProfile")
    likes = relationship("ContentLike", back_populates="content", cascade="all, delete-orphan")
