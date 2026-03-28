from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
import structlog
from app.services.market_service import market_service

router = APIRouter()
logger = structlog.get_logger()


class SyncRequest(BaseModel):
    ticker: str
    period: str = "1y"


class MultiQuoteRequest(BaseModel):
    tickers: List[str]


@router.get("/quote/{ticker}")
async def get_quote(ticker: str):
    """Get current price, change %, volume for a ticker."""
    try:
        data = await market_service.get_quote(ticker.upper())
        if "error" in data:
            raise HTTPException(status_code=404, detail=f"No data found for {ticker}")
        return data
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Quote fetch failed", ticker=ticker, error=str(e))
        raise HTTPException(status_code=500, detail="Failed to fetch quote")


@router.get("/history/{ticker}")
async def get_price_history(
    ticker: str,
    period: str = Query(default="3mo", description="1d 5d 1mo 3mo 6mo 1y 2y 5y max"),
    interval: str = Query(default="1d", description="1m 5m 15m 1h 1d 1wk 1mo"),
):
    """Get OHLCV price history for charts."""
    try:
        data = await market_service.get_price_history(ticker.upper(), period=period, interval=interval)
        return data
    except Exception as e:
        logger.error("Price history failed", ticker=ticker, error=str(e))
        raise HTTPException(status_code=500, detail="Failed to fetch price history")


@router.get("/info/{ticker}")
async def get_company_info(ticker: str):
    """Get full company profile including sector, employees, ratios."""
    try:
        data = await market_service.get_company_info(ticker.upper())
        if "error" in data:
            raise HTTPException(status_code=404, detail=f"No info found for {ticker}")
        return data
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Company info failed", ticker=ticker, error=str(e))
        raise HTTPException(status_code=500, detail="Failed to fetch company info")


@router.post("/quotes")
async def get_multiple_quotes(req: MultiQuoteRequest):
    """Bulk quote fetch for up to 20 tickers at once."""
    if len(req.tickers) > 20:
        raise HTTPException(status_code=400, detail="Max 20 tickers per request")
    tickers = [t.upper() for t in req.tickers]
    quotes = await market_service.get_multiple_quotes(tickers)
    return {"quotes": quotes}


@router.get("/volume-spike/{ticker}")
async def check_volume_spike(ticker: str):
    """Check if ticker has unusual volume today vs 20-day average."""
    try:
        spike = await market_service.detect_volume_spike(ticker.upper())
        return {"ticker": ticker.upper(), "spike": spike}
    except Exception as e:
        logger.error("Volume spike check failed", ticker=ticker, error=str(e))
        raise HTTPException(status_code=500, detail="Volume check failed")


@router.post("/sync")
async def sync_price_history(req: SyncRequest):
    """Sync price history from yfinance into the PricePoint database table."""
    try:
        count = await market_service.sync_price_history_to_db(
            req.ticker.upper(), period=req.period
        )
        return {"ticker": req.ticker.upper(), "inserted": count, "period": req.period}
    except Exception as e:
        logger.error("Price sync failed", ticker=req.ticker, error=str(e))
        raise HTTPException(status_code=500, detail="Price sync failed")
