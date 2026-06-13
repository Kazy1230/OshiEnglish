from sqlalchemy import Column, Integer, String, JSON, DateTime, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.core.database import Base

class Character(Base):
    """
    JSON列の使い分けポリシー:
    tone_profile / color_scheme / greetings はキャラクターごとの「設定値の塊」であり、
    検索・集計・一括更新の対象にはならない（プロンプト生成・UI表示への読み込み専用）ため
    JSON列のままで問題ない。
    一方、絞り込み・並び替え・集計クエリの対象になるフィールド（例: Customer.intimacy_points,
    Customer.priority, Customer.assigned_admin_id）は、JSON内に置かず通常のカラムとして
    切り出すこと。新しいフィールドを追加する際もこの基準で判断する。
    """
    __tablename__ = "characters"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(String(500), nullable=True)
    greeting = Column(String(300), nullable=True)  # 本棚に表示する顧客向けの一言（後方互換用の単一メッセージ）
    greetings = Column(JSON, nullable=True)  # 本棚に表示する一言のバリエーション一覧（複数登録してランダム表示するため）
    image_url = Column(String(500), nullable=True)  # AI生成キャラクター画像のパス（/static/character_images/...）
    tone_profile = Column(JSON, nullable=True)   # 口調・性格プロファイル
    color_scheme = Column(JSON, nullable=True)   # UIカラー設定
    font_style = Column(String(100), nullable=True)
    reward_progress_template = Column(String(300), nullable=True)  # DM画面のご褒美進捗メッセージ（{character}/{published}/{remaining}/{target} を置換）
    chat_footer_note = Column(String(300), nullable=True)  # DM画面の入力欄下の注意書き（世界観に合わせてキャラごとに変更可能）
    chat_error_message = Column(String(300), nullable=True)  # DM送信失敗時にキャラの口調で表示するエラー文言
    instagram_account = Column(String(100), nullable=True)  # 公式Instagramアカウント名（@なし、例: shirakawa_yukina._.a）
    is_preset = Column(Boolean, default=False, nullable=False)  # 公式キャラクターかどうか
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    customers = relationship("Customer", back_populates="character")
    articles = relationship("Article", back_populates="character", foreign_keys="Article.character_id")
