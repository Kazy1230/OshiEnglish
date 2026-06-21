from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Answer(Base):
    """質問への回答（AIまたは講師）。"""
    __tablename__ = "answers"

    id = Column(Integer, primary_key=True, index=True)
    question_id = Column(Integer, ForeignKey("questions.id"), nullable=False, index=True)
    answered_by = Column(String(20), nullable=False)  # ai / instructor
    body = Column(Text, nullable=False)
    linked_content_url = Column(String(500), nullable=True)
    is_draft = Column(Boolean, nullable=False, default=False)  # Tier Bの講師確認前はtrue
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    sent_at = Column(DateTime(timezone=True), nullable=True)

    question = relationship("Question", back_populates="answers")
