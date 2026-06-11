from sqlalchemy import Column, Integer, DateTime
from sqlalchemy.sql import func
from app.core.database import Base


class IntimacySettings(Base):
    """親密度ポイントの自動加算設定（単一行のみを使用するシングルトン設定テーブル）。

    各イベント発生時に加算するポイント数を管理画面から変更できるようにする。
    """
    __tablename__ = "intimacy_settings"

    id = Column(Integer, primary_key=True)
    points_per_message = Column(Integer, nullable=False, default=1)         # メッセージ送信時
    points_per_purchase = Column(Integer, nullable=False, default=10)       # コンテンツ購入時
    points_per_login = Column(Integer, nullable=False, default=1)           # ログイン時（1日1回まで）
    points_per_exercise_submit = Column(Integer, nullable=False, default=1) # 演習問題提出時
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
