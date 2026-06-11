import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

RESEND_API_URL = "https://api.resend.com/emails"


def send_email(to: str, subject: str, html: str) -> bool:
    """Resend経由でメールを送信する（ベストエフォート）。

    RESEND_API_KEY が未設定、または宛先が空の場合は何もせず False を返す。
    送信に失敗しても例外は投げず、呼び出し元の処理（決済完了処理など）を止めない。
    """
    if not settings.RESEND_API_KEY or not to:
        return False
    try:
        resp = httpx.post(
            RESEND_API_URL,
            headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
            json={
                "from": settings.RESEND_FROM_EMAIL,
                "to": [to],
                "subject": subject,
                "html": html,
            },
            timeout=10.0,
        )
        resp.raise_for_status()
        return True
    except Exception:
        logger.exception(f"[Resend] メール送信に失敗しました: to={to}, subject={subject}")
        return False
