from sqlalchemy import Column, Integer, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Favorite(Base):
    """お気に入りクリエイター。"""
    __tablename__ = "favorites"
    __table_args__ = (
        UniqueConstraint("user_id", "creator_id", name="uq_favorites_user_creator"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    creator_id = Column(Integer, ForeignKey("creator_profiles.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("Customer", back_populates="favorites")
    creator = relationship("CreatorProfile")
