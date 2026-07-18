from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class AccessExtension(Base):
    """自由進行型コースのAI/チャット利用期限（90日）を延長する単発課金の履歴。"""
    __tablename__ = "access_extensions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)
    days = Column(Integer, nullable=False, default=90)
    amount = Column(Integer, nullable=False)  # 購入時の価格(円)
    stripe_payment_intent_id = Column(String(255), unique=True, nullable=False)
    status = Column(String(20), nullable=False, default="pending")  # pending / succeeded / failed
    purchased_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("Customer")
    course = relationship("Course")
