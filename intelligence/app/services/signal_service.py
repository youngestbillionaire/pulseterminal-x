"""
Early signal detection engine.
Detects: mention spikes, sentiment reversals, unusual volume, price anomalies.
"""
from __future__ import annotations
from datetime import datetime, timezone, timedelta
from typing import List
import structlog

from app.utils.database import get_session

logger = structlog.get_logger()

SIGNAL_THRESHOLDS = {
    "mention_spike_multiplier": 3.0,      # 3x normal mention rate
    "sentiment_reversal_delta": 0.4,       # 0.4 score swing in 4h
    "volume_spike_multiplier": 2.5,        # 2.5x avg volume
    "price_anomaly_pct": 5.0,             # 5% price move in 1h
}

def severity_from_score(score: float) -> str:
    if score >= 85:  return "CRITICAL"
    if score >= 65:  return "HIGH"
    if score >= 40:  return "MEDIUM"
    return "LOW"


class SignalDetectionService:

    async def detect_all(self, ticker: str) -> List[dict]:
        """Run all detectors for a ticker and return signal list."""
        detectors = [
            self._detect_mention_spike,
            self._detect_sentiment_reversal,
            self._detect_earnings_anomaly,
        ]

        signals = []
        for detector in detectors:
            try:
                result = await detector(ticker)
                if result:
                    signals.extend(result if isinstance(result, list) else [result])
            except Exception as e:
                logger.warning("Signal detector failed", detector=detector.__name__, ticker=ticker, error=str(e))

        return signals

    async def _detect_mention_spike(self, ticker: str) -> List[dict]:
        """Detect abnormal spike in Reddit/news mentions."""
        async with get_session() as session:
            from sqlalchemy import text
            # Compare last 2h vs 48h baseline
            result = await session.execute(text("""
                SELECT
                    COUNT(CASE WHEN "createdAt" > NOW() - INTERVAL '2 hours' THEN 1 END)::float AS recent,
                    COUNT(CASE WHEN "createdAt" BETWEEN NOW() - INTERVAL '48 hours'
                                                    AND NOW() - INTERVAL '2 hours' THEN 1 END)::float / 23.0 AS hourly_baseline
                FROM "RedditMention"
                WHERE ticker = :ticker
                  AND "createdAt" > NOW() - INTERVAL '48 hours'
            """), {"ticker": ticker.upper()})
            row = result.mappings().first()

        if not row:
            return []

        recent = row["recent"] or 0
        baseline = row["hourly_baseline"] or 1
        multiplier = recent / max(baseline * 2, 1)  # 2h window vs 2h worth of baseline

        if multiplier < SIGNAL_THRESHOLDS["mention_spike_multiplier"]:
            return []

        score = min(100, (multiplier / 10) * 100)
        return [{
            "type": "MENTION_SPIKE",
            "severity": severity_from_score(score),
            "title": f"${ticker} mention spike: {multiplier:.1f}x normal rate",
            "description": (
                f"${ticker} is receiving {multiplier:.1f}x its normal mention rate "
                f"over the last 2 hours ({int(recent)} mentions vs ~{baseline:.1f}/hr baseline). "
                "Elevated social media activity often precedes price volatility."
            ),
            "score": round(score, 1),
            "data": {
                "recent_mentions": int(recent),
                "hourly_baseline": round(baseline, 2),
                "multiplier": round(multiplier, 2),
            },
        }]

    async def _detect_sentiment_reversal(self, ticker: str) -> List[dict]:
        """Detect significant sentiment swing in last 4 hours."""
        async with get_session() as session:
            from sqlalchemy import text
            result = await session.execute(text("""
                SELECT
                    AVG(CASE WHEN "recordedAt" > NOW() - INTERVAL '4 hours'
                        THEN score END) AS recent_score,
                    AVG(CASE WHEN "recordedAt" BETWEEN NOW() - INTERVAL '48 hours'
                                                   AND NOW() - INTERVAL '4 hours'
                        THEN score END) AS prior_score
                FROM "SentimentLog"
                WHERE ticker = :ticker
                  AND "recordedAt" > NOW() - INTERVAL '48 hours'
            """), {"ticker": ticker.upper()})
            row = result.mappings().first()

        if not row or row["recent_score"] is None or row["prior_score"] is None:
            return []

        recent = float(row["recent_score"])
        prior = float(row["prior_score"])
        delta = recent - prior

        if abs(delta) < SIGNAL_THRESHOLDS["sentiment_reversal_delta"]:
            return []

        direction = "bullish" if delta > 0 else "bearish"
        score = min(100, abs(delta) * 150)

        return [{
            "type": "SENTIMENT_REVERSAL",
            "severity": severity_from_score(score),
            "title": f"${ticker} sentiment turning {direction} (Δ{delta:+.2f})",
            "description": (
                f"${ticker} sentiment shifted {direction} by {abs(delta):.2f} points "
                f"over the last 4 hours (from {prior:.2f} to {recent:.2f}). "
                "A reversal of this magnitude may indicate changing market perception."
            ),
            "score": round(score, 1),
            "data": {
                "recent_score": round(recent, 4),
                "prior_score": round(prior, 4),
                "delta": round(delta, 4),
                "direction": direction,
            },
        }]

    async def _detect_earnings_anomaly(self, ticker: str) -> List[dict]:
        """Detect significant earnings beats/misses."""
        async with get_session() as session:
            from sqlalchemy import text
            result = await session.execute(text("""
                SELECT
                    "epsSurprisePct",
                    "revenueSurprisePct",
                    "fiscalQuarter",
                    "reportDate"
                FROM "EarningsReport"
                WHERE ticker = :ticker
                  AND status = 'REPORTED'
                  AND "reportDate" > NOW() - INTERVAL '72 hours'
                ORDER BY "reportDate" DESC
                LIMIT 1
            """), {"ticker": ticker.upper()})
            row = result.mappings().first()

        if not row:
            return []

        signals = []
        eps_surprise = row["epsSurprisePct"]
        rev_surprise = row["revenueSurprisePct"]

        if eps_surprise is not None and abs(eps_surprise) >= 10:
            beat_miss = "EARNINGS_BEAT" if eps_surprise > 0 else "EARNINGS_MISS"
            score = min(100, abs(eps_surprise) * 2)
            signals.append({
                "type": beat_miss,
                "severity": severity_from_score(score),
                "title": f"${ticker} EPS {'+' if eps_surprise > 0 else ''}{eps_surprise:.1f}% vs estimates",
                "description": (
                    f"${ticker} reported {row['fiscalQuarter']} EPS "
                    f"{'beating' if eps_surprise > 0 else 'missing'} consensus by {abs(eps_surprise):.1f}%."
                ),
                "score": round(score, 1),
                "data": {
                    "eps_surprise_pct": eps_surprise,
                    "rev_surprise_pct": rev_surprise,
                    "quarter": row["fiscalQuarter"],
                },
            })

        return signals


signal_detector = SignalDetectionService()
