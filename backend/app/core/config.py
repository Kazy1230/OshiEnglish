from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    DATABASE_URL: str = "mysql+pymysql://yt_user:yt_pass@db:3306/yourteacher"
    REDIS_URL: str = "redis://redis:6379"
    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # 本番では "https://yourdomain.com" を設定する
    ALLOWED_ORIGINS: str = "http://localhost,http://localhost:3000"

    # 本番では False に設定してSwagger UIを非公開にする
    DOCS_ENABLED: bool = True

    # DM返信の下書き生成（キャラクターになりきった文章生成）に使用するDeepSeek API
    DEEPSEEK_API_KEY: str = ""
    DEEPSEEK_MODEL: str = "deepseek-chat"
    # デイリー伴走チャットのデフォルトモデル（低コスト）。NEEDS_SONNETキーワードに該当する質問のみDEEPSEEK_MODELへエスカレーション
    # DeepSeekにはAnthropicのSonnet/Haikuのような明確な上位/下位モデルの区別がないため、
    # 現状は同じdeepseek-chatを指す（将来deepseek-reasoner等に分けたい場合はここを変更する）
    DEEPSEEK_MODEL_LITE: str = "deepseek-chat"

    # クリエイター収益管理：プラットフォーム手数料率（要件定義書5.9節「ユーザー課金→手数料控除→クリエイター残高」）
    PLATFORM_FEE_RATE: float = 0.2

    # ----- 決済（Stripe） -----
    # 未設定の場合、決済関連エンドポイントは503を返し、フォーム送信のみの従来フローにフォールバックする
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_PRICE_ID: str = ""
    # 決済完了後のリダイレクト先（フロントエンドのベースURL）
    FRONTEND_URL: str = "http://localhost:3000"
    # テスト環境向け：Stripeを呼ばずに購入・サブスク登録を即時成功させる(UI/ワークフローはそのまま維持する)
    PAYMENTS_TEST_MODE: bool = False

    # ----- メール送信（Resend） -----
    # 未設定の場合、メール送信は何もせずスキップする（ベストエフォート）
    RESEND_API_KEY: str = ""
    RESEND_FROM_EMAIL: str = "onboarding@resend.dev"

    @property
    def allowed_origins_list(self) -> List[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    class Config:
        env_file = ".env"

settings = Settings()
