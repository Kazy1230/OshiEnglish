from sqlalchemy import Column, Integer, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class CardProgress(Base):
    """カード単位の学習進捗。"""
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

    user = relationship("Customer")
    card = relationship("ChapterCard", back_populates="progress_records")
