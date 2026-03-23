from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import structlog
from app.services.signal_service import signal_detector

router = APIRouter()
logger = structlog.get_logger()

class DetectRequest(BaseModel):
    ticker: str

@router.post("/detect")
async def detect_signals(req: DetectRequest):
    try:
        signals = await signal_detector.detect_all(req.ticker.upper())
        return {"ticker": req.ticker.upper(), "signals": signals, "count": len(signals)}
    except Exception as e:
        logger.error("Signal detection failed", ticker=req.ticker, error=str(e))
        raise HTTPException(status_code=500, detail="Signal detection failed")
