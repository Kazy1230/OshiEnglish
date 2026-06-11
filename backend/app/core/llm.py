# Anthropic API（Messages API）を呼び出すための薄いラッパー。
# DM返信の下書き生成など、キャラクターになりきった文章生成に使用する。
import httpx
from app.core.config import settings

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"


class LLMError(Exception):
    """AI応答の生成に失敗した場合に送出する。"""


def generate_text(system_prompt: str, messages: list[dict], max_tokens: int = 1024) -> str:
    if not settings.ANTHROPIC_API_KEY:
        raise LLMError("ANTHROPIC_API_KEYが設定されていません。管理者にお問い合わせください。")

    try:
        resp = httpx.post(
            ANTHROPIC_API_URL,
            headers={
                "x-api-key": settings.ANTHROPIC_API_KEY,
                "anthropic-version": ANTHROPIC_VERSION,
                "content-type": "application/json",
            },
            json={
                "model": settings.ANTHROPIC_MODEL,
                "max_tokens": max_tokens,
                "system": system_prompt,
                "messages": messages,
            },
            timeout=120.0,
        )
        resp.raise_for_status()
    except httpx.HTTPError as e:
        raise LLMError(f"AI応答の生成に失敗しました: {e}") from e

    data = resp.json()
    parts = data.get("content", [])
    text = "".join(p.get("text", "") for p in parts if p.get("type") == "text").strip()
    if not text:
        raise LLMError("AIから有効な応答が得られませんでした")
    return text
