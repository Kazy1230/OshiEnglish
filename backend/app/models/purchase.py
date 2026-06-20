from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class Purchase(Base):
    """コース単位の購入履歴(マーケットプレイス決済)。

    UNIQUE(user_id, course_id)はstatus='succeeded'のレコードに対してのみアプリ側でチェックする
    (pending/failedの再試行で複数行できることを許容するため、DB制約は付けない)。
    """
    __tablename__ = "purchases"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    course_id = Column(Integer, ForeignKey("courses.id"), nullable=False, index=True)
    amount = Column(Integer, nullable=False)  # 購入時の価格(円)
    stripe_payment_intent_id = Column(String(255), unique=True, nullable=False)
    status = Column(String(20), nullable=False, default="pending")  # pending / succeeded / failed
    purchased_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("Customer", back_populates="purchases")
    course = relationship("Course", back_populates="purchases")
