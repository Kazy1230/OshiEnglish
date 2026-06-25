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
    category = Column(String(100), nullable=True)  # TOEIC / IELTS / 英文法 など
    status = Column(String(20), nullable=False, default="draft")  # draft / published / unpublished
    price = Column(Integer, nullable=False, default=0)  # 単位: 円
    is_free = Column(Boolean, nullable=False, default=False)
    # --- 30日伴走コース（v1.1） ---
    goal = Column(String(255), nullable=True)  # 例:「TOEIC800点を取得する」
    target_learner = Column(Text, nullable=True)  # 例:「現在600点前後・3ヶ月後に受験予定」
    intensity = Column(String(100), nullable=True)  # 例:「1日30〜60分」。30日コース生成のインプットに使用
    study_materials = Column(Text, nullable=True)  # 使用する教材（例:「公式問題集Vol.8」）。30日コース生成のインプットに使用
    pace = Column(String(50), nullable=True)  # 進行速度（例:「ゆっくり」「標準」「速め」）。30日コース生成のインプットに使用
    personality_profile_id = Column(Integer, ForeignKey("personality_profiles.id"), nullable=True, index=True)
    # 30日分の生成は週単位で複数回のAI呼び出しを要する（数分かかる）ため、バックグラウンドタスクで実行し
    # このカラムで進行状況を管理する（フロントエンドはポーリングしてプログレスバーを表示する）
    days_generation_status = Column(String(20), nullable=False, default="idle")  # idle / generating / completed / failed
    days_generation_error = Column(Text, nullable=True)
    # Tier A(AIのみ)/ Tier B(AI+クリエイター添削)の月額（円）。両方NULLの場合は買い切り（price/is_free）コースとして扱う
    tier_a_price = Column(Integer, nullable=True)
    tier_b_price = Column(Integer, nullable=True)
    # 管理者によるコース停止（G-02）。creatorの通常のCourseUpdate経由では変更できない（管理者専用エンドポイントのみ）
    is_suspended = Column(Boolean, nullable=False, default=False)
    suspension_reason = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    character = relationship("Character", back_populates="courses")
    lessons = relationship("Lesson", back_populates="course", order_by="Lesson.order")
    purchases = relationship("Purchase", back_populates="course")
    personality_profile = relationship("PersonalityProfile")
    days = relationship("CourseDay", back_populates="course", order_by="CourseDay.day_number")
    materials = relationship("CourseMaterial", back_populates="course")
    subscriptions = relationship("CourseSubscription", back_populates="course")
