from sqlalchemy import Column, Integer, String, Text, Boolean, JSON, DateTime, Date, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class Customer(Base):
    __tablename__ = "customers"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    email = Column(String(255), nullable=True)
    is_admin = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    is_password_reset_required = Column(Boolean, default=True)
    # パスワード再発行（セルフサービス）用のトークンと有効期限
    reset_token = Column(String(255), nullable=True, index=True)
    reset_token_expires = Column(DateTime(timezone=True), nullable=True)
    # Stripeの定期課金（サブスクリプション）ID。買い切りプランでは未使用（NULL）。
    stripe_subscription_id = Column(String(255), nullable=True)
    # 退会処理を行った日時（退会済みかどうかの判定にも使用）
    withdrawn_at = Column(DateTime(timezone=True), nullable=True)
    character_id = Column(Integer, ForeignKey("characters.id"), nullable=True)
    theme_config = Column(JSON, nullable=True)
    # キャラクターが「この顧客のことを覚えている」体を演出するためのメモ。
    # 管理者が記録し、記事・ブログ生成プロンプトに織り込むことで「特別感」を出す。
    # 例: {"nickname": "...", "birthday": "08-15", "favorites": ["...", "..."],
    #      "episodes": ["前回◯◯について話した", "..."], "tone_notes": "もっとフランクに話してほしいらしい"}
    character_memory = Column(JSON, nullable=True)
    # 親密度（キャラクターとの関係性の深さを表す累計ポイント）。
    # 会話のやり取りで自動的に加算され、関係性の段階（敬語→タメ口→愛称…）の判定や、
    # 利用継続のモチベーションにつながる「育成要素」として使用する。
    # 管理者は返信内容によって手動で増減できる（極端な対応を取った顧客の関係性を調整するため）。
    intimacy_points = Column(Integer, default=0, nullable=False)
    # ログインボーナス（親密度ポイント）を最後に付与した日付。1日1回までに制限するために使用する。
    last_login_bonus_date = Column(Date, nullable=True)
    # キャラ作成完了前に案内する「最初の1つ無料」コンテンツを利用済みかどうか（一人一回限り）。
    free_content_claimed = Column(Boolean, default=False, nullable=False)
    # オリジナルキャラ（キャラクタービルダー）作成完了の「ようこそ」表示が未読かどうか。
    # 既存顧客はTrue（表示済み扱い）。管理者が初めてcharacter_idを割り当てた時にFalseにし、
    # 本棚で一度表示したらTrueに戻す（一人一回限りの演出）。
    character_ready_announced = Column(Boolean, default=True, nullable=False)
    subscription_plan = Column(String(50), default="buy_once")  # buy_once / monthly
    # サポート担当の割り当て（管理者・オペレーター複数人での分担運用のため）。
    # is_admin=True の customers.id を指す。未割り当ての場合は NULL。
    assigned_admin_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    # 対応優先度（SLA管理用）。normal / high の2段階。
    priority = Column(String(20), default="normal", nullable=False)
    # 管理者がDM対応の中で「重要だと感じたこと」（誕生日・苦手分野への不安など）を記録するメモ。
    # DM返信下書き生成プロンプトに織り込むことで、担当者が増えても細かい情報を踏まえた返信ができるようにする。
    admin_memo = Column(Text, nullable=True)
    # ログインセキュリティ: 連続失敗回数とアカウントロック解除時刻（時間経過で自動解除）
    failed_login_attempts = Column(Integer, nullable=False, default=0)
    locked_until = Column(DateTime(timezone=True), nullable=True)
    # 管理者向け二段階認証（メール認証コード）
    two_factor_code = Column(String(10), nullable=True)
    two_factor_code_expires = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    assigned_admin = relationship("Customer", remote_side=[id], foreign_keys=[assigned_admin_id])

    character = relationship("Character", back_populates="customers")
    articles = relationship("Article", back_populates="customer")
    access_logs = relationship("AccessLog", back_populates="customer")
    messages = relationship("Message", back_populates="customer")
