from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class ChapterCard(Base):
    """章内の学習カード。動画視聴・課題・テスト・メッセージの4種。"""
    __tablename__ = "chapter_cards"

    id = Column(Integer, primary_key=True, index=True)
    chapter_id = Column(Integer, ForeignKey("course_chapters.id"), nullable=False, index=True)
    order = Column(Integer, nullable=False, default=0)
    # video / assignment / test / message
    card_type = Column(String(20), nullable=False, default="video")
    title = Column(String(255), nullable=True)
    body = Column(Text, nullable=True)        # message/assignment/testの本文
    youtube_url = Column(String(500), nullable=True)
    is_preview = Column(Boolean, nullable=False, default=False)
    # YouTube oEmbed による可用性チェック結果
    youtube_available = Column(Boolean, nullable=True)
    youtube_checked_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    chapter = relationship("CourseChapter", back_populates="cards")
    progress_records = relationship("CardProgress", back_populates="card", cascade="all, delete-orphan")
