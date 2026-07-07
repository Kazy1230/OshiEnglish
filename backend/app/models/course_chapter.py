from sqlalchemy import Column, Integer, String, Text, JSON, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class CourseChapter(Base):
    """カリキュラムの章。コース共通の骨格（全学習者共通）。"""
    __tablename__ = "course_chapters"

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)
    order = Column(Integer, nullable=False, default=0)
    title = Column(String(255), nullable=False)
    goal = Column(Text, nullable=True)
    # 例: ["塔の高さが本館の1.5倍以上", "2種類以上の建材を使用"]
    assessment_criteria = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    course = relationship("Course", back_populates="chapters")
    cards = relationship("ChapterCard", back_populates="chapter", order_by="ChapterCard.order", cascade="all, delete-orphan")
