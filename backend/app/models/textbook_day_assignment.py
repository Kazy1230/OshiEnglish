from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.core.database import Base


class TextbookDayAssignment(Base):
    """教材の各章・項目を30日のうちどの日にやるかの割り当て。day_number=NULLは「やらない」を表す。"""
    __tablename__ = "textbook_day_assignments"

    id = Column(Integer, primary_key=True, index=True)
    course_textbook_id = Column(Integer, ForeignKey("course_textbooks.id"), nullable=False, index=True)
    toc_item = Column(String(255), nullable=False)  # 章・項目名
    day_number = Column(Integer, nullable=True)  # 1〜30。NULLなら「やらない」

    course_textbook = relationship("CourseTextbook", back_populates="day_assignments")
