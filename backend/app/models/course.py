from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Course(Base):
    """講師が公開する購入単位のコース。"""
    __tablename__ = "courses"

    id = Column(Integer, primary_key=True, index=True)
    character_id = Column(Integer, ForeignKey("characters.id"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    thumbnail_url = Column(String(500), nullable=True)
    subject = Column(String(20), nullable=False, default="english", index=True, comment="english | it | music")
    category = Column(String(100), nullable=True)  # TOEIC / IELTS / 英文法 など
    status = Column(String(20), nullable=False, default="draft")  # draft / published / unpublished
    price = Column(Integer, nullable=False, default=0)  # 単位: 円
    is_free = Column(Boolean, nullable=False, default=False)
    # --- カリキュラム（v2.0: 章/カード構造に移行） ---
    personality_profile_id = Column(Integer, ForeignKey("personality_profiles.id"), nullable=True, index=True)
    # カリキュラム作成時の入力（外部AIとの壁打ち用プロンプト生成に使用）
    curriculum_target_audience = Column(Text, nullable=True)
    curriculum_topics = Column(Text, nullable=True)
    curriculum_style = Column(Text, nullable=True)
    # 卒業動画URL（全章完了時に再生）
    completion_video_url = Column(String(500), nullable=True)
    # Tier A(AIのみ)/ Tier B(AI+クリエイター添削)の月額（円）。両方NULLの場合は買い切り（price/is_free）コースとして扱う
    tier_a_price = Column(Integer, nullable=True)
    tier_b_price = Column(Integer, nullable=True)
    # 管理者によるコース停止（G-02）。creatorの通常のCourseUpdate経由では変更できない（管理者専用エンドポイントのみ）
    is_suspended = Column(Boolean, nullable=False, default=False)
    suspension_reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    character = relationship("Character", back_populates="courses")
    purchases = relationship("Purchase", back_populates="course")
    personality_profile = relationship("PersonalityProfile")
    materials = relationship("CourseMaterial", back_populates="course")
    subscriptions = relationship("CourseSubscription", back_populates="course")
    textbooks = relationship("CourseTextbook", back_populates="course", cascade="all, delete-orphan")
    diagnosis_questions = relationship("CourseDiagnosisQuestion", back_populates="course", cascade="all, delete-orphan", order_by="CourseDiagnosisQuestion.order")
    chapters = relationship("CourseChapter", back_populates="course", order_by="CourseChapter.order", cascade="all, delete-orphan")
