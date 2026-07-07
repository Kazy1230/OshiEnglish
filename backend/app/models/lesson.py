from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Lesson(Base):
    """コース内の個別レッスン(テキスト or 動画)。"""
    __tablename__ = "lessons"

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)
    order = Column(Integer, nullable=False)  # コース内の表示順
    title = Column(String(255), nullable=False)
    content_type = Column(String(20), nullable=False)  # text / video
    body = Column(Text, nullable=True)  # content_type='text'の場合の本文
    youtube_url = Column(String(500), nullable=True)  # content_type='video'の場合のYouTube embed URL
    is_preview = Column(Boolean, nullable=False, default=False)  # 未購入でも閲覧可能なレッスンか
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    course = relationship("Course", foreign_keys=[course_id])
    progress_records = relationship("LessonProgress", back_populates="lesson")
