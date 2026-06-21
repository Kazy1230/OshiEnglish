from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Question(Base):
    """学習者からの相談・質問（デイリー伴走チャット）。"""
    __tablename__ = "questions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)
    tier = Column(String(1), nullable=False, default="A")  # A / B
    body = Column(Text, nullable=False)
    category_id = Column(Integer, ForeignKey("question_categories.id"), nullable=True, index=True)
    # pending / answered_by_ai / answered_by_instructor / pending_instructor
    status = Column(String(30), nullable=False, default="pending")
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    category = relationship("QuestionCategory", back_populates="questions")
    answers = relationship("Answer", back_populates="question", order_by="Answer.created_at")
    course = relationship("Course")
