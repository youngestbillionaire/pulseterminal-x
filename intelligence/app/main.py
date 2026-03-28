from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import structlog
import time

from app.routers import insights, sentiment, signals, ingest, health, market
from app.utils.logger import setup_logging
from app.utils.database import init_db
from app.utils.redis_client import init_redis
from app.middleware.auth import InternalAuthMiddleware

setup_logging()
logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting PulseTerminal X Intelligence Service")
    await init_db()
    await init_redis()
    logger.info("Intelligence service ready")
    yield
    logger.info("Shutting down intelligence service")


app = FastAPI(
    title="PulseTerminal X Intelligence Engine",
    description="AI-powered financial intelligence microservice",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
)

# ─── Middleware ───────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(InternalAuthMiddleware)


@app.middleware("http")
async def add_timing(request: Request, call_next):
    start = time.time()
    response = await call_next(request)
    duration = round((time.time() - start) * 1000, 2)
    response.headers["X-Process-Time"] = f"{duration}ms"
    return response


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception", path=str(request.url), error=str(exc))
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error", "detail": str(exc)},
    )


# ─── Routers ─────────────────────────────────────────────────────────────────
app.include_router(health.router,     prefix="/health",    tags=["Health"])
app.include_router(insights.router,   prefix="/insights",  tags=["Insights"])
app.include_router(sentiment.router,  prefix="/sentiment", tags=["Sentiment"])
app.include_router(signals.router,    prefix="/signals",   tags=["Signals"])
app.include_router(ingest.router,     prefix="/ingest",    tags=["Ingestion"])
app.include_router(market.router,     prefix="/market",    tags=["Market Data"])
