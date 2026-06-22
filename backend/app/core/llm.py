# Anthropic API（Messages API）を呼び出すための薄いラッパー。
# DM返信の下書き生成、AIコンテンツ生成スタジオの二段階生成（素材生成→口調変換→台本）に使用する。
import json
import re
from typing import Iterator
import httpx
from app.core.config import settings

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"


class LLMError(Exception):
    """AI応答の生成に失敗した場合に送出する。"""


def generate_text(system_prompt: str | list[dict], messages: list[dict], max_tokens: int = 1024, model: str | None = None) -> str:
    """system_promptは文字列、またはAnthropic Prompt Caching用のcontent blockリストを渡せる。
    例: [{"type": "text", "text": "...", "cache_control": {"type": "ephemeral"}}, {"type": "text", "text": "..."}]
    人格プロファイルなど複数回の呼び出しで再利用される固定プレフィックスにcache_controlを付けることで、
    入力トークンのキャッシュ書き込み/読み込み料金が通常より安くなる（詳細設計書2.5節）。
    """
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
                "model": model or settings.ANTHROPIC_MODEL,
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


def stream_text(system_prompt: str, messages: list[dict], max_tokens: int = 2000) -> Iterator[str]:
    """Anthropic Messages APIのSSEストリーミングを使い、テキスト断片を逐次yieldする。

    anthropic公式SDKは依存に含めず、既存のgenerate_text()と同じhttpxベースで
    Server-Sent Eventsを自前でパースする（生成系エンドポイントの待機体験改善のため）。
    """
    if not settings.ANTHROPIC_API_KEY:
        raise LLMError("ANTHROPIC_API_KEYが設定されていません。管理者にお問い合わせください。")

    try:
        with httpx.stream(
            "POST",
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
                "stream": True,
            },
            timeout=180.0,
        ) as resp:
            resp.raise_for_status()
            for line in resp.iter_lines():
                if not line or not line.startswith("data:"):
                    continue
                payload = line[len("data:"):].strip()
                if not payload:
                    continue
                try:
                    event = json.loads(payload)
                except json.JSONDecodeError:
                    continue
                if event.get("type") == "content_block_delta":
                    delta = event.get("delta", {})
                    if delta.get("type") == "text_delta":
                        text = delta.get("text", "")
                        if text:
                            yield text
    except httpx.HTTPError as e:
        raise LLMError(f"AI応答の生成に失敗しました: {e}") from e


def extract_json(text: str) -> dict:
    """AI応答からJSONオブジェクトを取り出す。

    ```json ... ``` のようなMarkdownコードフェンスで囲まれて返ってくる場合があるため、
    まずフェンスを除去し、それでも失敗する場合は最初の{から最後の}までを抜き出して再試行する。
    """
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip(), flags=re.MULTILINE).strip()
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(cleaned[start:end + 1])
        except json.JSONDecodeError:
            pass
    raise LLMError("AIの応答をJSONとして解析できませんでした")
