from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
import structlog
from app.services.reddit_service import reddit_service
from app.services.news_service import news_service

router = APIRouter()
logger = structlog.get_logger()

class IngestRequest(BaseModel):
    ticker: str
    company_name: str = ""

@router.post("/reddit")
async def ingest_reddit(req: IngestRequest, bg: BackgroundTasks):
    # Run synchronously for immediate feedback; use bg tasks for bulk
    try:
        result = await reddit_service.ingest_and_analyze(req.ticker.upper())
        return result
    except Exception as e:
        logger.error("Reddit ingestion failed", ticker=req.ticker, error=str(e))
        raise HTTPException(status_code=500, detail="Reddit ingestion failed")

@router.post("/news")
async def ingest_news(req: IngestRequest):
    try:
        result = await news_service.ingest_and_analyze(req.ticker.upper(), req.company_name)
        return result
    except Exception as e:
        logger.error("News ingestion failed", ticker=req.ticker, error=str(e))
        raise HTTPException(status_code=500, detail="News ingestion failed")

@router.post("/all")
async def ingest_all(req: IngestRequest, bg: BackgroundTasks):
    """Queue both reddit + news ingestion in background."""
    bg.add_task(reddit_service.ingest_and_analyze, req.ticker.upper())
    bg.add_task(news_service.ingest_and_analyze, req.ticker.upper(), req.company_name)
    return {"status": "queued", "ticker": req.ticker.upper()}
