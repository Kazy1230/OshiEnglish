from sqlalchemy import Column, Integer, String, Text, JSON, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class CourseDiagnosisQuestion(Base):
    """クリエイターがコース作成時に追加する、Day1診断のカスタム質問。"""
    __tablename__ = "course_diagnosis_questions"

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)
    question_text = Column(Text, nullable=False)
    answer_type = Column(String(10), nullable=False, default="text")  # text / number / single / multi
    options = Column(JSON, nullable=True)  # single/multiの場合の選択肢配列
    is_required = Column(Boolean, nullable=False, default=True)
    order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    course = relationship("Course", back_populates="diagnosis_questions")
