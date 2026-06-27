from sqlalchemy import Column, Integer, String, JSON, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base


class CourseTextbook(Base):
    """コースに紐づく教材。プリセット教材（textbook_idあり）または手入力教材（custom_name/custom_tocあり）のいずれか。"""
    __tablename__ = "course_textbooks"

    id = Column(Integer, primary_key=True, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)
    textbook_id = Column(Integer, ForeignKey("textbooks.id"), nullable=True)  # NULLなら手入力教材
    custom_name = Column(String(255), nullable=True)  # 手入力の場合の書籍名
    custom_toc = Column(JSON, nullable=True)  # 手入力の場合の目次データ
    type = Column(String(20), nullable=False, default="textbook")  # textbook / vocabulary
    daily_words = Column(Integer, nullable=True)  # 単語帳の場合：1日あたりの新規語数
    review_words = Column(Integer, nullable=True)  # 単語帳の場合：1日あたりの復習語数
    target_laps = Column(Integer, nullable=False, default=1)  # コース完了条件として求める周回数（例: Duo3.0を2周）

    course = relationship("Course", back_populates="textbooks")
    textbook = relationship("Textbook")
    day_assignments = relationship("TextbookDayAssignment", back_populates="course_textbook", cascade="all, delete-orphan")
