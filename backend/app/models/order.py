from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime
from sqlalchemy.sql import func
from app.core.database import Base

class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    customer_name = Column(String(200), nullable=False)
    contact = Column(String(300), nullable=True)       # SNSアカウント等
    character_name = Column(String(200), nullable=True)
    grammar_topic = Column(String(300), nullable=True)
    status = Column(String(20), default="new")         # new / in_progress / delivered
    notes = Column(Text, nullable=True)                # 運営者メモ
    # 受注からアカウント作成後、対応する顧客IDを紐づけることで
    # 「この受注からどの顧客が生まれたか」「対応完了しているか」を追跡できる
    customer_id = Column(Integer, nullable=True)       # customers.id（FK制約は簡易マイグレーション環境のためアプリ側で管理）
    email = Column(String(255), nullable=True)         # 申し込みフォームで入力されたメールアドレス（アカウント情報の送付先）
    form_submitted_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # ----- Stripe決済・アカウント自動発行 -----
    stripe_session_id = Column(String(255), nullable=True, index=True)  # Stripe Checkout Session ID
    stripe_payment_status = Column(String(20), nullable=True)           # 例: "paid"
    issued_username = Column(String(100), nullable=True)                # 自動発行したアカウントのユーザー名
    # 自動発行した一時パスワード（平文）。完了画面で一度表示したら破棄する。
    issued_password = Column(String(255), nullable=True)
    credentials_viewed = Column(Boolean, nullable=False, default=False) # 完了画面でID/PWを表示済みか

    # ----- 返金 -----
    stripe_payment_intent_id = Column(String(255), nullable=True)  # Stripe PaymentIntent ID（返金時に使用）
    refund_status = Column(String(20), nullable=True)              # 例: "refunded"
    refunded_at = Column(DateTime(timezone=True), nullable=True)

    # ----- 領収書・請求書 -----
    amount_total = Column(Integer, nullable=True)        # 決済金額（最小通貨単位。JPYは円そのもの）
    currency = Column(String(10), nullable=True)         # 例: "jpy"
    stripe_invoice_id = Column(String(255), nullable=True)   # Stripeの自動発行請求書ID
    stripe_receipt_url = Column(String(500), nullable=True)  # Stripeの領収書URL
