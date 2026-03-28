"""
Market data service using yfinance — free, no API key needed.
Provides: OHLCV price history, current quote, company info, volume analysis.
"""
from __future__ import annotations
import asyncio
from datetime import datetime, timezone
from typing import List, Optional
import structlog

logger = structlog.get_logger()


class MarketDataService:

    async def get_price_history(
        self,
        ticker: str,
        period: str = "3mo",
        interval: str = "1d",
    ) -> dict:
        """
        Fetch OHLCV price history.
        period: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max
        interval: 1m, 2m, 5m, 15m, 30m, 60m, 90m, 1h, 1d, 5d, 1wk, 1mo, 3mo
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._fetch_history, ticker, period, interval)

    def _fetch_history(self, ticker: str, period: str, interval: str) -> dict:
        try:
            import yfinance as yf
            t = yf.Ticker(ticker)
            hist = t.history(period=period, interval=interval, auto_adjust=True)

            if hist.empty:
                return {"ticker": ticker, "prices": [], "period": period, "interval": interval}

            prices = []
            for ts, row in hist.iterrows():
                prices.append({
                    "timestamp": ts.isoformat(),
                    "open": round(float(row["Open"]), 4),
                    "high": round(float(row["High"]), 4),
                    "low": round(float(row["Low"]), 4),
                    "close": round(float(row["Close"]), 4),
                    "volume": int(row["Volume"]),
                })

            return {
                "ticker": ticker.upper(),
                "prices": prices,
                "period": period,
                "interval": interval,
                "count": len(prices),
            }
        except Exception as e:
            logger.error("yfinance price history failed", ticker=ticker, error=str(e))
            return {"ticker": ticker, "prices": [], "error": str(e)}

    async def get_quote(self, ticker: str) -> dict:
        """Get current price, change, volume for a ticker."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._fetch_quote, ticker)

    def _fetch_quote(self, ticker: str) -> dict:
        try:
            import yfinance as yf
            t = yf.Ticker(ticker)
            info = t.fast_info

            return {
                "ticker": ticker.upper(),
                "price": round(float(info.last_price or 0), 4),
                "previous_close": round(float(info.previous_close or 0), 4),
                "change": round(float((info.last_price or 0) - (info.previous_close or 0)), 4),
                "change_pct": round(
                    float(((info.last_price or 0) - (info.previous_close or 0)) / (info.previous_close or 1) * 100), 4
                ),
                "volume": int(info.three_month_average_volume or 0),
                "market_cap": int(info.market_cap or 0),
                "52w_high": round(float(info.year_high or 0), 4),
                "52w_low": round(float(info.year_low or 0), 4),
                "fetched_at": datetime.now(timezone.utc).isoformat(),
            }
        except Exception as e:
            logger.error("yfinance quote failed", ticker=ticker, error=str(e))
            return {"ticker": ticker, "error": str(e)}

    async def get_company_info(self, ticker: str) -> dict:
        """Get full company profile from yfinance."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._fetch_info, ticker)

    def _fetch_info(self, ticker: str) -> dict:
        try:
            import yfinance as yf
            t = yf.Ticker(ticker)
            info = t.info

            return {
                "ticker": ticker.upper(),
                "name": info.get("longName") or info.get("shortName", ""),
                "sector": info.get("sector", ""),
                "industry": info.get("industry", ""),
                "description": (info.get("longBusinessSummary") or "")[:1000],
                "website": info.get("website", ""),
                "employees": info.get("fullTimeEmployees"),
                "country": info.get("country", "US"),
                "exchange": info.get("exchange", ""),
                "market_cap": info.get("marketCap"),
                "pe_ratio": info.get("trailingPE"),
                "forward_pe": info.get("forwardPE"),
                "eps": info.get("trailingEps"),
                "dividend_yield": info.get("dividendYield"),
                "beta": info.get("beta"),
                "avg_volume": info.get("averageVolume"),
                "logo_url": f"https://logo.clearbit.com/{info.get('website', '').replace('https://', '').replace('http://', '').split('/')[0]}" if info.get("website") else None,
            }
        except Exception as e:
            logger.error("yfinance info failed", ticker=ticker, error=str(e))
            return {"ticker": ticker, "error": str(e)}

    async def get_multiple_quotes(self, tickers: List[str]) -> List[dict]:
        """Fetch quotes for multiple tickers concurrently."""
        tasks = [self.get_quote(t) for t in tickers]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        return [r for r in results if isinstance(r, dict)]

    async def detect_volume_spike(self, ticker: str) -> Optional[dict]:
        """
        Detect unusual volume vs 20-day average.
        Returns spike data if today's volume is 2x+ avg.
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._check_volume_spike, ticker)

    def _check_volume_spike(self, ticker: str) -> Optional[dict]:
        try:
            import yfinance as yf
            t = yf.Ticker(ticker)
            hist = t.history(period="1mo", interval="1d", auto_adjust=True)

            if len(hist) < 5:
                return None

            avg_volume = float(hist["Volume"].iloc[:-1].mean())
            today_volume = float(hist["Volume"].iloc[-1])

            if avg_volume == 0:
                return None

            multiplier = today_volume / avg_volume

            if multiplier < 2.0:
                return None

            return {
                "ticker": ticker.upper(),
                "today_volume": int(today_volume),
                "avg_volume": int(avg_volume),
                "multiplier": round(multiplier, 2),
                "severity": "CRITICAL" if multiplier >= 5 else "HIGH" if multiplier >= 3 else "MEDIUM",
            }
        except Exception as e:
            logger.warning("Volume spike check failed", ticker=ticker, error=str(e))
            return None

    async def sync_price_history_to_db(self, ticker: str, period: str = "1y") -> int:
        """
        Fetch price history and store it in the PricePoint table.
        Returns number of records inserted.
        """
        data = await self.get_price_history(ticker, period=period, interval="1d")
        prices = data.get("prices", [])
        if not prices:
            return 0

        from app.utils.database import get_session
        from sqlalchemy import text

        inserted = 0
        async with get_session() as session:
            for p in prices:
                try:
                    await session.execute(
                        text("""
                            INSERT INTO "PricePoint"
                                (id, "companyId", ticker, timestamp, open, high, low, close, volume, source)
                            SELECT
                                gen_random_uuid(), c.id, :ticker,
                                :timestamp::timestamptz,
                                :open, :high, :low, :close, :volume, 'yfinance'
                            FROM "Company" c WHERE c.ticker = :ticker
                            ON CONFLICT (ticker, timestamp) DO UPDATE
                                SET close = EXCLUDED.close,
                                    volume = EXCLUDED.volume
                        """),
                        {
                            "ticker": ticker.upper(),
                            "timestamp": p["timestamp"],
                            "open": p["open"],
                            "high": p["high"],
                            "low": p["low"],
                            "close": p["close"],
                            "volume": p["volume"],
                        }
                    )
                    inserted += 1
                except Exception as e:
                    logger.warning("Price insert failed", ticker=ticker, ts=p["timestamp"], error=str(e))

            await session.commit()

        logger.info("Price history synced", ticker=ticker, inserted=inserted)
        return inserted


market_service = MarketDataService()
