from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
import structlog
from app.services.sentiment_service import sentiment_analyzer
from app.services.signal_service import signal_detector
from app.services.reddit_service import reddit_service
from app.services.news_service import news_service

# ─── Sentiment ────────────────────────────────────────────────────────────────
router = APIRouter()
logger = structlog.get_logger()

class AnalyzeRequest(BaseModel):
    ticker: str
    texts: List[str]

@router.post("/analyze")
async def analyze_sentiment(req: AnalyzeRequest):
    if not req.texts:
        raise HTTPException(status_code=400, detail="texts list is empty")
    if len(req.texts) > 500:
        raise HTTPException(status_code=400, detail="Max 500 texts per request")
    scored = await sentiment_analyzer.analyze_batch(req.texts)
    aggregate = sentiment_analyzer.aggregate_sentiment(scored)
    return {"ticker": req.ticker, "scored": scored, "aggregate": aggregate}
