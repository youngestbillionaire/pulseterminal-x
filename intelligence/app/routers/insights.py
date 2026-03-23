from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import structlog
from app.services.insight_service import ai_insight_service

router = APIRouter()
logger = structlog.get_logger()

class EarningsInsightRequest(BaseModel):
    report_id: str

class SentimentInsightRequest(BaseModel):
    ticker: str
    reddit_data: dict = {}
    news_data: dict = {}

@router.post("/earnings")
async def generate_earnings_insight(req: EarningsInsightRequest):
    try:
        insight = await ai_insight_service.generate_earnings_insight(req.report_id)
        return {"insight": insight}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error("Insight generation failed", report_id=req.report_id, error=str(e))
        raise HTTPException(status_code=500, detail="Insight generation failed")

@router.post("/sentiment")
async def generate_sentiment_insight(req: SentimentInsightRequest):
    try:
        insight = await ai_insight_service.generate_sentiment_insight(
            req.ticker, req.reddit_data, req.news_data
        )
        return {"insight": insight}
    except Exception as e:
        logger.error("Sentiment insight failed", ticker=req.ticker, error=str(e))
        raise HTTPException(status_code=500, detail="Sentiment insight failed")
