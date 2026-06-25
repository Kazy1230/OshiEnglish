from sqlalchemy import Column, Integer, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from app.core.database import Base


class DailySummary(Base):
    """Layer3が直近3日分の文脈として参照する、その日のチャットの圧縮済みサマリー（100トークン以内）。"""
    __tablename__ = "daily_summaries"
    __table_args__ = (
        UniqueConstraint("user_id", "course_id", "day_number", name="uq_daily_summaries_user_course_day"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)
    day_number = Column(Integer, nullable=False)
    summary = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
