from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class CreatorProfile(Base):
    """クリエイタープロフィール。customers.role='creator' のユーザーに1件だけ紐づく。"""
    __tablename__ = "creator_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("customers.id"), unique=True, nullable=False, index=True)
    bio = Column(Text, nullable=True)
    speciality = Column(String(255), nullable=True)  # 専門分野
    experience = Column(Text, nullable=True)  # 指導実績
    sns_youtube = Column(String(500), nullable=True)
    sns_instagram = Column(String(500), nullable=True)
    sns_twitter = Column(String(500), nullable=True)
    status = Column(String(20), nullable=False, default="pending")  # pending / active / suspended
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("Customer", back_populates="creator_profile")
    # 1クリエイターには1つの人格(キャラクター)のみ紐づく
    character = relationship("Character", back_populates="creator", uselist=False)
    personality_profile = relationship("PersonalityProfile", back_populates="creator", uselist=False)
    interview_session = relationship("InterviewSession", back_populates="creator", uselist=False)
