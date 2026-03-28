from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
import structlog
from app.services.reddit_service import reddit_service
from app.services.news_service import news_service
from app.services.market_service import market_service

router = APIRouter()
logger = structlog.get_logger()


class IngestRequest(BaseModel):
    ticker: str
    company_name: str = ""


@router.post("/reddit")
async def ingest_reddit(req: IngestRequest):
    """Scrape Reddit for ticker mentions — no API key required."""
    try:
        result = await reddit_service.ingest_and_analyze(req.ticker.upper())
        return result
    except Exception as e:
        logger.error("Reddit ingestion failed", ticker=req.ticker, error=str(e))
        raise HTTPException(status_code=500, detail="Reddit ingestion failed")


@router.post("/news")
async def ingest_news(req: IngestRequest):
    """Ingest news from NewsAPI + RSS feeds."""
    try:
        result = await news_service.ingest_and_analyze(req.ticker.upper(), req.company_name)
        return result
    except Exception as e:
        logger.error("News ingestion failed", ticker=req.ticker, error=str(e))
        raise HTTPException(status_code=500, detail="News ingestion failed")


@router.post("/market")
async def ingest_market_data(req: IngestRequest):
    """Sync price history from yfinance into database."""
    try:
        count = await market_service.sync_price_history_to_db(req.ticker.upper())
        return {"ticker": req.ticker.upper(), "inserted": count}
    except Exception as e:
        logger.error("Market data ingestion failed", ticker=req.ticker, error=str(e))
        raise HTTPException(status_code=500, detail="Market data ingestion failed")


@router.post("/all")
async def ingest_all(req: IngestRequest, bg: BackgroundTasks):
    """Queue reddit + news + market data ingestion in background."""
    bg.add_task(reddit_service.ingest_and_analyze, req.ticker.upper())
    bg.add_task(news_service.ingest_and_analyze, req.ticker.upper(), req.company_name)
    bg.add_task(market_service.sync_price_history_to_db, req.ticker.upper())
    return {"status": "queued", "ticker": req.ticker.upper()}
