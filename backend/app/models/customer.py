from sqlalchemy import Column, Integer, String, Boolean, JSON, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    email = Column(String(255), nullable=True)
    # learner(学習者) / creator(クリエイター) / admin(管理者)
    role = Column(String(20), nullable=False, default="learner")
    is_active = Column(Boolean, default=True)
    is_password_reset_required = Column(Boolean, default=True)
    # パスワード再発行（セルフサービス）用のトークンと有効期限
    reset_token = Column(String(255), nullable=True, index=True)
    reset_token_expires = Column(DateTime(timezone=True), nullable=True)
    # Stripeの定期課金（サブスクリプション）ID
    stripe_subscription_id = Column(String(255), nullable=True)
    # 退会処理を行った日時（退会済みかどうかの判定にも使用）
    withdrawn_at = Column(DateTime(timezone=True), nullable=True)
    character_id = Column(Integer, ForeignKey("characters.id"), nullable=True)
    theme_config = Column(JSON, nullable=True)
    subscription_plan = Column(String(50), default="buy_once")  # buy_once / monthly
    # ログインセキュリティ: 連続失敗回数とアカウントロック解除時刻（時間経過で自動解除）
    failed_login_attempts = Column(Integer, nullable=False, default=0)
    locked_until = Column(DateTime(timezone=True), nullable=True)
    # 管理者向け二段階認証（メール認証コード）
    two_factor_code = Column(String(10), nullable=True)
    two_factor_code_expires = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    character = relationship("Character", back_populates="customers")
    creator_profile = relationship("CreatorProfile", back_populates="user", uselist=False)
    purchases = relationship("Purchase", back_populates="user")
    lesson_progress_records = relationship("LessonProgress", back_populates="user")
    favorites = relationship("Favorite", back_populates="user")
    notifications = relationship("Notification", back_populates="user")
