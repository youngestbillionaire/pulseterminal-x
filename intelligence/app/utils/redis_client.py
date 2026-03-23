import redis.asyncio as aioredis
from app.config import settings
import structlog

logger = structlog.get_logger()

redis_client: aioredis.Redis = None  # type: ignore

async def init_redis():
    global redis_client
    redis_client = aioredis.from_url(
        settings.REDIS_URL,
        encoding="utf-8",
        decode_responses=True,
        max_connections=20,
    )
    await redis_client.ping()
    logger.info("Redis connected")
