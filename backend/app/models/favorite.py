from sqlalchemy import Column, Integer, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Favorite(Base):
    """お気に入り講師。"""
    __tablename__ = "favorites"
    __table_args__ = (
        UniqueConstraint("user_id", "instructor_id", name="uq_favorites_user_instructor"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    instructor_id = Column(Integer, ForeignKey("instructor_profiles.id"), nullable=False, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("Customer", back_populates="favorites")
    instructor = relationship("InstructorProfile")
