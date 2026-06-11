from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    DATABASE_URL: str = "mysql+pymysql://yt_user:yt_pass@db:3306/yourteacher"
    REDIS_URL: str = "redis://redis:6379"
    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    WEBHOOK_SECRET: str = "your-webhook-secret-change-me"

    # 本番では "https://yourdomain.com" を設定する
    ALLOWED_ORIGINS: str = "http://localhost,http://localhost:3000"

    # 本番では False に設定してSwagger UIを非公開にする
    DOCS_ENABLED: bool = True

    # DM返信の下書き生成（キャラクターになりきった文章生成）に使用するAnthropic API
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL: str = "claude-sonnet-4-6"

    # ----- 決済（Stripe） -----
    # 未設定の場合、決済関連エンドポイントは503を返し、フォーム送信のみの従来フローにフォールバックする
    STRIPE_SECRET_KEY: str = ""
    STRIPE_WEBHOOK_SECRET: str = ""
    STRIPE_PRICE_ID: str = ""
    # 決済完了後のリダイレクト先（フロントエンドのベースURL）
    FRONTEND_URL: str = "http://localhost:3000"

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
