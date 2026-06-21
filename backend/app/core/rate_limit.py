import logging

import redis
from fastapi import HTTPException, Request, status

from app.core.config import settings

logger = logging.getLogger(__name__)

_redis_client: redis.Redis | None = None


def _get_redis() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis_client


def _client_ip(request: Request) -> str:
    # nginxがX-Forwarded-Forを付与する（複数の場合は先頭が実クライアントIP）
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def enforce_rate_limit(request: Request, key_prefix: str, limit: int, window_seconds: int) -> None:
    """同一IPからの一定時間内のリクエスト数を制限する（カードテスティング等の悪用対策）。

    Redis接続に失敗した場合は安全側に倒し、制限せず通過させる（決済機能を止めないため）。
    """
    ip = _client_ip(request)
    key = f"ratelimit:{key_prefix}:{ip}"
    try:
        client = _get_redis()
        count = client.incr(key)
        if count == 1:
            client.expire(key, window_seconds)
        if count > limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="リクエストが多すぎます。しばらく時間をおいてから再度お試しください",
            )
    except redis.RedisError:
        logger.exception("[RateLimit] Redis接続に失敗したため、レート制限をスキップしました")


def enforce_daily_message_limit(user_id: int, course_id: int, limit: int = 10) -> int:
    """学習者1人・1コースあたりの1日のチャット送信数を制限する（カードテスティング対策と同様にRedisで実装）。

    Redis接続に失敗した場合は安全側に倒し、制限せず通過させる（チャット機能を止めないため）。
    戻り値は今回の送信を含めた本日の累計送信数。
    """
    key = f"chatlimit:{user_id}:{course_id}:{_today_str()}"
    try:
        client = _get_redis()
        count = client.incr(key)
        if count == 1:
            client.expire(key, 60 * 60 * 24)
        if count > limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="本日のチャット回数の上限（10回）に達しました。明日またお話しましょう！",
            )
        return count
    except redis.RedisError:
        logger.exception("[RateLimit] Redis接続に失敗したため、チャット回数制限をスキップしました")
        return 0


def _today_str() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")
