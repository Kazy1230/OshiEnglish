from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class ServiceItem(Base):
    """料金表・サービスメニューの1項目。

    将来的に決済システムと連携することを見越して「商品カタログ」として独立させてある。
    現時点では決済は実装せず、顧客が「気になる」をタップするとDMでキャラクターに相談が届く
    という、キャラクター主導の営業導線（接客）の入口として機能する。
    """
    __tablename__ = "service_items"

    id = Column(Integer, primary_key=True, index=True)
    category = Column(String(100), nullable=False, index=True)   # 例: "プラン" / "TOEIC" / "英検リーディング" / "IELTS" / "TOEFL" / "文法記事"
    name = Column(String(200), nullable=False)                   # 例: "Part 1" / "スタータープラン"
    description = Column(String(500), nullable=True)             # 例: "6問＋解説"
    price_label = Column(String(100), nullable=False)            # 例: "500円" / "2,000円" / "1,000円〜"
    fulfillment = Column(String(100), nullable=True)             # 例: "自動" / "マニュアル＋キャラフィードバック"（nullなら無表示）
    sort_order = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)    # 顧客向けページへの掲載可否
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
