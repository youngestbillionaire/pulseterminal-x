"""FastAPI Routers — all in one file for brevity, split per module in production."""
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional
import structlog

logger = structlog.get_logger()

# ─── Health ───────────────────────────────────────────────────────────────────
router = APIRouter()

@router.get("/")
async def health():
    from app.utils.database import engine
    from app.utils.redis_client import redis_client
    db_ok, redis_ok = True, True
    try:
        async with engine.connect() as conn:
            from sqlalchemy import text
            await conn.execute(text("SELECT 1"))
    except Exception:
        db_ok = False
    try:
        await redis_client.ping()
    except Exception:
        redis_ok = False

    status = "ok" if db_ok and redis_ok else "degraded"
    return {"status": status, "database": db_ok, "redis": redis_ok}

@router.get("/live")
async def liveness():
    return {"status": "ok"}
