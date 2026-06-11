from sqlalchemy import Column, Integer, String, Text, DateTime, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base


class RewardItem(Base):
    """親密度・記事依頼回数の達成によって解放される報酬コンテンツ。

    category: "line"（隠しセリフ）/ "title"（称号）/ "wallpaper"（壁紙）
    trigger_type: "intimacy"（親密度レベル到達）/ "article_count"（記事依頼回数到達）
    threshold: trigger_type=intimacy の場合は到達した親密度レベル（1〜5）、
               trigger_type=article_count の場合は累計の記事依頼回数。
    """
    __tablename__ = "reward_items"

    id = Column(Integer, primary_key=True, index=True)
    character_id = Column(Integer, ForeignKey("characters.id"), nullable=False, index=True)
    category = Column(String(20), nullable=False)        # line / title / wallpaper
    trigger_type = Column(String(20), nullable=False)     # intimacy / article_count
    threshold = Column(Integer, nullable=False)

    # コンテンツ（隠しセリフ本文 / 称号名）
    text_content = Column(Text, nullable=True)
    # 称号アイコン（絵文字など）
    icon = Column(String(50), nullable=True)
    # 壁紙画像（/static/reward_images/...）
    image_url = Column(String(500), nullable=True)

    sort_order = Column(Integer, nullable=False, default=0)
    # 公式キャラクター限定の報酬かどうか
    official_only = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    character = relationship("Character")


class CustomerReward(Base):
    """顧客ごとに解放済みの報酬を記録する。"""
    __tablename__ = "customer_rewards"
    __table_args__ = (
        UniqueConstraint("customer_id", "reward_item_id", name="uq_customer_reward"),
    )

    id = Column(Integer, primary_key=True, index=True)
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=False, index=True)
    reward_item_id = Column(Integer, ForeignKey("reward_items.id"), nullable=False, index=True)
    unlocked_at = Column(DateTime(timezone=True), server_default=func.now())
    # 解放演出（アニメーション）をまだ顧客に見せていない場合 True
    is_new = Column(Boolean, nullable=False, default=True)

    customer = relationship("Customer")
    reward_item = relationship("RewardItem")
