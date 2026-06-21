from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class Report(Base):
    """学習者からの通報（G-03 管理者機能）。"""
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    reporter_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    target_type = Column(String(20), nullable=False)  # course / creator
    target_id = Column(Integer, nullable=False)
    reason = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default="pending")  # pending / resolved
    created_at = Column(DateTime(timezone=True), server_default=func.now())
