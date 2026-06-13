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
