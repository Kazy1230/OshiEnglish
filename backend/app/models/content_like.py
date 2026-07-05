from datetime import datetime
from sqlalchemy import Column, Integer, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.core.database import Base


class ContentLike(Base):
    """コンテンツへのいいね（user_id × content_id でユニーク）。"""
    __tablename__ = "content_likes"

    id = Column(Integer, primary_key=True)
    content_id = Column(Integer, ForeignKey("creator_contents.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("content_id", "user_id", name="uq_content_likes"),)

    content = relationship("CreatorContent", back_populates="likes")
