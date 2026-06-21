from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class CategoryContent(Base):
    """質問カテゴリに紐付けたコンテンツ（動画・記事・PDF）。AIの回答に自動で含める。"""
    __tablename__ = "category_contents"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("question_categories.id"), nullable=False, index=True)
    content_type = Column(String(20), nullable=False)  # video / article / pdf
    title = Column(String(255), nullable=False)
    url = Column(String(500), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    category = relationship("QuestionCategory", back_populates="contents")
