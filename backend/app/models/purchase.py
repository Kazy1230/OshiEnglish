from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
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
    # 学習者が自分で設定する目標ペース
    target_pace = Column(String(20), nullable=True)  # 2weeks / 1month / 3months / no_deadline
    pace_set_at = Column(DateTime(timezone=True), nullable=True)
    # 卒業フラグ（全カード完了時）
    is_graduated = Column(Boolean, nullable=False, default=False)
    graduated_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("Customer", back_populates="purchases")
    course = relationship("Course", back_populates="purchases")
