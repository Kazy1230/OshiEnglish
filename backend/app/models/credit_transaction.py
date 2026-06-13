from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.core.database import Base


class CreditTransaction(Base):
    __tablename__ = "credit_transactions"

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    amount = Column(Integer, nullable=False)  # 増減量（消費はマイナス）
    # "dm_send" / "article_request" / "signup_bonus_preset" / "signup_bonus_original" / "purchase" / "admin_adjust"
    reason = Column(String(100), nullable=False)
    balance_after = Column(Integer, nullable=False)
    related_message_id = Column(Integer, ForeignKey("messages.id"), nullable=True)
    stripe_session_id = Column(String(255), nullable=True, index=True)  # 購入の重複付与防止用
    created_at = Column(DateTime(timezone=True), server_default=func.now())
