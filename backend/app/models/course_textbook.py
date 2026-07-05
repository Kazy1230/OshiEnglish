from sqlalchemy import Column, Integer, String, JSON, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base


class CourseTextbook(Base):
    """コースに紐づく教材。textbook_id(プリセット)・custom_name(手入力)・content_id(コンテンツプール)のいずれか。"""
    __tablename__ = "course_textbooks"

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)
    textbook_id = Column(Integer, ForeignKey("textbooks.id"), nullable=True)
    content_id = Column(Integer, ForeignKey("creator_contents.id"), nullable=True)  # コンテンツプール教材
    custom_name = Column(String(255), nullable=True)
    custom_toc = Column(JSON, nullable=True)
    type = Column(String(20), nullable=False, default="textbook")  # textbook / vocabulary / content
    daily_words = Column(Integer, nullable=True)
    review_words = Column(Integer, nullable=True)
    target_laps = Column(Integer, nullable=False, default=1)

    course = relationship("Course", back_populates="textbooks")
    textbook = relationship("Textbook")
    content = relationship("CreatorContent")
    day_assignments = relationship("TextbookDayAssignment", back_populates="course_textbook", cascade="all, delete-orphan")
