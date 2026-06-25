# DeepSeek API（OpenAI互換 Chat Completions）を呼び出すための薄いラッパー。
# DM返信の下書き生成、AIコンテンツ生成スタジオの二段階生成（素材生成→口調変換→台本）に使用する。
import json
import re
from typing import Iterator
import httpx
from app.core.config import settings

DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions"


class LLMError(Exception):
    """AI応答の生成に失敗した場合に送出する。"""


def _flatten_system_prompt(system_prompt: str | list[dict]) -> str:
    """Anthropic形式のcontent block配列（cache_control付き等）が渡された場合、
    プレーンな文字列に変換する。DeepSeekはAnthropic Prompt Cachingのcache_control指定を
    解釈しないため、ここでは単純にtextを連結するのみとする（DeepSeek側は自動でコンテキストキャッシュを行う）。
    """
    if isinstance(system_prompt, str):
        return system_prompt
    return "\n".join(block.get("text", "") for block in system_prompt)


def generate_text(
    system_prompt: str | list[dict],
    messages: list[dict],
    max_tokens: int = 1024,
    model: str | None = None,
    json_mode: bool = False,
) -> str:
    """system_promptは文字列、またはAnthropic形式のcontent blockリスト（互換性のため）を渡せる。
    json_mode=Trueの場合、DeepSeekのresponse_format=json_objectを使い、有効なJSON以外を返さないようにする
    （DeepSeek側の制約上、system_promptまたはmessages中に「JSON」という単語を含める必要がある）。
    """
    if not settings.DEEPSEEK_API_KEY:
        raise LLMError("DEEPSEEK_API_KEYが設定されていません。管理者にお問い合わせください。")

    payload = {
        "model": model or settings.DEEPSEEK_MODEL,
        "max_tokens": max_tokens,
        "messages": [{"role": "system", "content": _flatten_system_prompt(system_prompt)}, *messages],
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    try:
        resp = httpx.post(
            DEEPSEEK_API_URL,
            headers={
                "Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}",
                "content-type": "application/json",
            },
            json=payload,
            timeout=120.0,
        )
        resp.raise_for_status()
    except httpx.HTTPError as e:
        raise LLMError(f"AI応答の生成に失敗しました: {e}") from e

    data = resp.json()
    text = (data.get("choices") or [{}])[0].get("message", {}).get("content", "").strip()
    if not text:
        raise LLMError("AIから有効な応答が得られませんでした")
    return text


def stream_text(system_prompt: str, messages: list[dict], max_tokens: int = 2000) -> Iterator[str]:
    """DeepSeek APIのSSEストリーミングを使い、テキスト断片を逐次yieldする。

    openai公式SDKは依存に含めず、既存のgenerate_text()と同じhttpxベースで
    Server-Sent Eventsを自前でパースする（生成系エンドポイントの待機体験改善のため）。
    """
    if not settings.DEEPSEEK_API_KEY:
        raise LLMError("DEEPSEEK_API_KEYが設定されていません。管理者にお問い合わせください。")

    try:
        with httpx.stream(
            "POST",
            DEEPSEEK_API_URL,
            headers={
                "Authorization": f"Bearer {settings.DEEPSEEK_API_KEY}",
                "content-type": "application/json",
            },
            json={
                "model": settings.DEEPSEEK_MODEL,
                "max_tokens": max_tokens,
                "messages": [{"role": "system", "content": _flatten_system_prompt(system_prompt)}, *messages],
                "stream": True,
            },
            timeout=180.0,
        ) as resp:
            resp.raise_for_status()
            for line in resp.iter_lines():
                if not line or not line.startswith("data:"):
                    continue
                payload = line[len("data:"):].strip()
                if not payload or payload == "[DONE]":
                    continue
                try:
                    event = json.loads(payload)
                except json.JSONDecodeError:
                    continue
                delta = (event.get("choices") or [{}])[0].get("delta", {})
                text = delta.get("content", "")
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
