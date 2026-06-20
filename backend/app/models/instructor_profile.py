from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class InstructorProfile(Base):
    """講師プロフィール。customers.role='instructor' のユーザーに1件だけ紐づく。"""
    __tablename__ = "instructor_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("customers.id"), unique=True, nullable=False, index=True)
    bio = Column(Text, nullable=True)
    sns_youtube = Column(String(500), nullable=True)
    sns_instagram = Column(String(500), nullable=True)
    sns_twitter = Column(String(500), nullable=True)
    status = Column(String(20), nullable=False, default="pending")  # pending / active / suspended
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("Customer", back_populates="instructor_profile")
    characters = relationship("Character", back_populates="instructor")
