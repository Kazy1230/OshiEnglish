from sqlalchemy import Column, Integer, String, JSON, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class QuestionCategory(Base):
    """クリエイターごとの質問カテゴリ（自動タグ付け・コンテンツ紐付けに使用）。"""
    __tablename__ = "question_categories"

    id = Column(Integer, primary_key=True, index=True)
    creator_id = Column(Integer, ForeignKey("creator_profiles.id"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    keywords = Column(JSON, nullable=True)  # 簡易マッチング用キーワード群
    # AIが提案した新規カテゴリ候補は pending、クリエイターが承認するまでコンテンツ紐付け・フラストレーション検知の対象外
    status = Column(String(20), nullable=False, default="pending")  # pending / approved / rejected
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    contents = relationship("CategoryContent", back_populates="category")
    questions = relationship("Question", back_populates="category")
