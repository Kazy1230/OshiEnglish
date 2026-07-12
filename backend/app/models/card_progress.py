from sqlalchemy import Column, Integer, Boolean, Text, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class CardProgress(Base):
    """カード単位の学習進捗。build_task種別の提出内容・AI一次判定・クリエイターの任意コメント、
    quiz種別の正誤もここに保持する（修正.md 2節）。"""
    __tablename__ = "card_progress"
    __table_args__ = (
        UniqueConstraint("user_id", "card_id", name="uq_card_progress_user_card"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    card_id = Column(Integer, ForeignKey("chapter_cards.id"), nullable=False, index=True)
    is_completed = Column(Boolean, nullable=False, default=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    last_accessed_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    # build_task提出内容（テキスト本文、または動画URL/写真URL）
    submission_text = Column(Text, nullable=True)
    submission_url = Column(String(500), nullable=True)
    submitted_at = Column(DateTime(timezone=True), nullable=True)
    # AIによる一次判定コメント（定性評価＋励まし。厳密な数値判定ではない）
    ai_feedback = Column(Text, nullable=True)
    # クリエイターによる任意の追加コメント（レビューは強制しないボーナスの関係性）
    creator_comment = Column(Text, nullable=True)
    creator_commented_at = Column(DateTime(timezone=True), nullable=True)
    # quiz種別: 直近の回答が正解だったか
    quiz_is_correct = Column(Boolean, nullable=True)

    user = relationship("Customer")
    card = relationship("ChapterCard", back_populates="progress_records")
