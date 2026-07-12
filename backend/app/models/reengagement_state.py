from sqlalchemy import Column, Integer, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from app.core.database import Base


class ReengagementState(Base):
    """沈黙ベース再エンゲージメント通知（修正.md 2節）の送信済み閾値を記録する。
    一度送ったら次の閾値に達するまで再送しないため、最後に送信した閾値（経過日数）を保持する。"""
    __tablename__ = "reengagement_states"
    __table_args__ = (
        UniqueConstraint("user_id", "course_id", name="uq_reengagement_states_user_course"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)
    last_threshold_days = Column(Integer, nullable=False)
    last_sent_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
