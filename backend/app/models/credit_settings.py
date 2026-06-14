from sqlalchemy import Column, Integer, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class CreditSettings(Base):
    """クレジット関連の料金設定（単一行のみを使用するシングルトン設定テーブル）。

    管理画面の「料金・メニュー」から変更できるようにする。
    """
    __tablename__ = "credit_settings"

    id = Column(Integer, primary_key=True)
    template_unlock_cost = Column(Integer, nullable=False, default=50)  # 定期便（特別記事）の開封コスト
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
