from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Course(Base):
    """講師が公開する購入単位のコース。"""
    __tablename__ = "courses"

    id = Column(Integer, primary_key=True, index=True)
    character_id = Column(Integer, ForeignKey("characters.id"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    thumbnail_url = Column(String(500), nullable=True)
    category = Column(String(100), nullable=True)  # TOEIC / IELTS / 英文法 など
    status = Column(String(20), nullable=False, default="draft")  # draft / published / unpublished
    price = Column(Integer, nullable=False, default=0)  # 単位: 円
    is_free = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    character = relationship("Character", back_populates="courses")
    lessons = relationship("Lesson", back_populates="course", order_by="Lesson.order")
    purchases = relationship("Purchase", back_populates="course")
