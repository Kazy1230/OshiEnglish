from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class GrammarMaster(Base):
    __tablename__ = "grammar_masters"

    id = Column(Integer, primary_key=True, index=True)
    topic_name = Column(String(200), nullable=False)
    exam_category = Column(String(50), nullable=False)  # TOEIC / IELTS / 英検 / 一般
    part = Column(String(50), nullable=True)             # Part5 / Part6 / Part7 / 一般
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    articles = relationship("Article", back_populates="grammar_master")
