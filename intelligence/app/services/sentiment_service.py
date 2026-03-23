"""
Sentiment analysis using FinBERT — a financial domain BERT model.
Falls back to a lexicon-based approach if GPU/model loading fails.
"""
from __future__ import annotations
import asyncio
import re
from typing import List, Tuple
from functools import lru_cache
import structlog

logger = structlog.get_logger()

FINANCIAL_POSITIVE = {
    "beat", "beats", "exceeded", "surge", "surged", "rally", "rallied",
    "growth", "profit", "profits", "gains", "gain", "bullish", "upgrade",
    "outperform", "buy", "strong", "strength", "record", "momentum",
    "expansion", "positive", "upside", "raised", "raise", "guidance",
}

FINANCIAL_NEGATIVE = {
    "miss", "missed", "decline", "declined", "fell", "fall", "loss",
    "losses", "bearish", "downgrade", "sell", "weak", "weakness",
    "concern", "risk", "uncertain", "cut", "cuts", "layoffs", "warn",
    "warning", "disappointing", "below", "negative", "downside", "revenue miss",
}

class SentimentAnalyzer:
    def __init__(self):
        self._model = None
        self._tokenizer = None
        self._model_loaded = False

    def _try_load_model(self):
        if self._model_loaded:
            return
        try:
            from transformers import pipeline
            from app.config import settings
            device = 0 if settings.USE_GPU else -1
            self._pipeline = pipeline(
                "text-classification",
                model=settings.SENTIMENT_MODEL,
                device=device,
                truncation=True,
                max_length=512,
            )
            self._model_loaded = True
            logger.info("FinBERT model loaded")
        except Exception as e:
            logger.warning("FinBERT load failed, using lexicon fallback", error=str(e))
            self._model_loaded = False
            self._pipeline = None

    def _lexicon_score(self, text: str) -> float:
        """Simple financial lexicon-based scorer. Returns -1.0 to 1.0."""
        text_lower = text.lower()
        words = set(re.findall(r'\b\w+\b', text_lower))

        pos = len(words & FINANCIAL_POSITIVE)
        neg = len(words & FINANCIAL_NEGATIVE)
        total = pos + neg

        if total == 0:
            return 0.0
        return (pos - neg) / total

    def analyze_single(self, text: str) -> Tuple[float, float]:
        """Returns (score: -1 to 1, confidence: 0 to 1)"""
        self._try_load_model()

        if self._pipeline:
            try:
                clean = text[:512]
                result = self._pipeline(clean)[0]
                label = result["label"].upper()
                score_raw = result["score"]

                if label == "POSITIVE":
                    return (score_raw, score_raw)
                elif label == "NEGATIVE":
                    return (-score_raw, score_raw)
                else:
                    return (0.0, score_raw)
            except Exception as e:
                logger.warning("FinBERT inference failed", error=str(e))

        # Lexicon fallback
        score = self._lexicon_score(text)
        confidence = min(abs(score) + 0.3, 1.0)
        return (score, confidence)

    async def analyze_batch(self, texts: List[str]) -> List[dict]:
        """Analyze a batch of texts asynchronously."""
        loop = asyncio.get_event_loop()
        results = []

        def _sync_batch():
            return [self.analyze_single(t) for t in texts]

        scored = await loop.run_in_executor(None, _sync_batch)

        for text, (score, confidence) in zip(texts, scored):
            if score > 0.1:
                label = "BULLISH"
            elif score < -0.1:
                label = "BEARISH"
            else:
                label = "NEUTRAL"

            results.append({
                "text": text[:200],
                "score": round(score, 4),
                "confidence": round(confidence, 4),
                "label": label,
            })

        return results

    def aggregate_sentiment(self, scored: List[dict]) -> dict:
        """Aggregate a list of scored texts into a summary."""
        if not scored:
            return {
                "score": 0.0,
                "magnitude": 0.0,
                "bullish_count": 0,
                "bearish_count": 0,
                "neutral_count": 0,
                "mention_count": 0,
                "label": "NEUTRAL",
            }

        scores = [s["score"] for s in scored]
        avg_score = sum(scores) / len(scores)
        magnitude = sum(abs(s) for s in scores) / len(scores)

        bullish = sum(1 for s in scored if s["label"] == "BULLISH")
        bearish = sum(1 for s in scored if s["label"] == "BEARISH")
        neutral = sum(1 for s in scored if s["label"] == "NEUTRAL")

        if avg_score > 0.1:
            label = "BULLISH"
        elif avg_score < -0.1:
            label = "BEARISH"
        else:
            label = "NEUTRAL"

        return {
            "score": round(avg_score, 4),
            "magnitude": round(magnitude, 4),
            "bullish_count": bullish,
            "bearish_count": bearish,
            "neutral_count": neutral,
            "mention_count": len(scored),
            "label": label,
        }


# Singleton
sentiment_analyzer = SentimentAnalyzer()
