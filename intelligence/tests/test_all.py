"""
Full test suite for the PulseTerminal X Intelligence Service.
"""
import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from httpx import AsyncClient, ASGITransport

# ─── Sentiment Tests ──────────────────────────────────────────────────────────

class TestSentimentAnalyzer:
    """Unit tests for the SentimentAnalyzer class."""

    def setup_method(self):
        from app.services.sentiment_service import SentimentAnalyzer
        self.analyzer = SentimentAnalyzer()

    def test_lexicon_score_positive(self):
        text = "Company beats earnings estimates with record profit growth"
        score = self.analyzer._lexicon_score(text)
        assert score > 0, f"Expected positive score, got {score}"

    def test_lexicon_score_negative(self):
        text = "Company misses revenue targets, warns of decline in profits"
        score = self.analyzer._lexicon_score(text)
        assert score < 0, f"Expected negative score, got {score}"

    def test_lexicon_score_neutral(self):
        text = "The quarterly meeting will be held on Thursday"
        score = self.analyzer._lexicon_score(text)
        # Neutral text should produce a score near zero
        assert abs(score) < 0.5

    def test_analyze_single_returns_tuple(self):
        score, confidence = self.analyzer.analyze_single("Apple beats earnings")
        assert isinstance(score, float)
        assert isinstance(confidence, float)
        assert -1.0 <= score <= 1.0
        assert 0.0 <= confidence <= 1.0

    @pytest.mark.asyncio
    async def test_analyze_batch(self):
        texts = [
            "Stock surged after beating earnings expectations",
            "Company missed revenue targets for the third quarter",
            "Trading volume remained average today",
        ]
        results = await self.analyzer.analyze_batch(texts)
        assert len(results) == 3
        for r in results:
            assert "score" in r
            assert "label" in r
            assert r["label"] in ["BULLISH", "BEARISH", "NEUTRAL"]

    def test_aggregate_empty(self):
        result = self.analyzer.aggregate_sentiment([])
        assert result["score"] == 0.0
        assert result["mention_count"] == 0
        assert result["label"] == "NEUTRAL"

    def test_aggregate_bullish_majority(self):
        scored = [
            {"score": 0.8, "label": "BULLISH"},
            {"score": 0.6, "label": "BULLISH"},
            {"score": -0.1, "label": "NEUTRAL"},
        ]
        result = self.analyzer.aggregate_sentiment(scored)
        assert result["label"] == "BULLISH"
        assert result["score"] > 0
        assert result["bullish_count"] == 2
        assert result["mention_count"] == 3


# ─── Signal Detection Tests ───────────────────────────────────────────────────

class TestSignalDetection:
    def setup_method(self):
        from app.services.signal_service import SignalDetectionService, severity_from_score
        self.service = SignalDetectionService()
        self.severity_from_score = severity_from_score

    def test_severity_thresholds(self):
        assert self.severity_from_score(90) == "CRITICAL"
        assert self.severity_from_score(70) == "HIGH"
        assert self.severity_from_score(50) == "MEDIUM"
        assert self.severity_from_score(20) == "LOW"
        assert self.severity_from_score(0) == "LOW"
        assert self.severity_from_score(100) == "CRITICAL"

    @pytest.mark.asyncio
    async def test_detect_mention_spike_no_data(self):
        """When there's no data, should return no signals."""
        with patch("app.services.signal_service.get_session") as mock_session:
            mock_ctx = AsyncMock()
            mock_ctx.__aenter__ = AsyncMock(return_value=mock_ctx)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_execute = AsyncMock()
            mock_execute.mappings.return_value.first.return_value = None
            mock_ctx.execute = AsyncMock(return_value=mock_execute)
            mock_session.return_value = mock_ctx

            signals = await self.service._detect_mention_spike("AAPL")
            assert signals == []

    @pytest.mark.asyncio
    async def test_detect_mention_spike_detected(self):
        """Should detect spike when multiplier exceeds threshold."""
        with patch("app.services.signal_service.get_session") as mock_session:
            mock_ctx = AsyncMock()
            mock_ctx.__aenter__ = AsyncMock(return_value=mock_ctx)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_execute = AsyncMock()
            mock_execute.mappings.return_value.first.return_value = {
                "recent": 150.0,    # high recent count
                "hourly_baseline": 5.0,  # low baseline
            }
            mock_ctx.execute = AsyncMock(return_value=mock_execute)
            mock_session.return_value = mock_ctx

            signals = await self.service._detect_mention_spike("NVDA")
            assert len(signals) == 1
            assert signals[0]["type"] == "MENTION_SPIKE"
            assert signals[0]["score"] > 0

    @pytest.mark.asyncio
    async def test_detect_sentiment_reversal_bullish(self):
        """Should detect bullish sentiment reversal."""
        with patch("app.services.signal_service.get_session") as mock_session:
            mock_ctx = AsyncMock()
            mock_ctx.__aenter__ = AsyncMock(return_value=mock_ctx)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_execute = AsyncMock()
            mock_execute.mappings.return_value.first.return_value = {
                "recent_score": 0.65,
                "prior_score": 0.15,
            }
            mock_ctx.execute = AsyncMock(return_value=mock_execute)
            mock_session.return_value = mock_ctx

            signals = await self.service._detect_sentiment_reversal("TSLA")
            assert len(signals) == 1
            assert signals[0]["type"] == "SENTIMENT_REVERSAL"
            assert "bullish" in signals[0]["description"].lower()

    @pytest.mark.asyncio
    async def test_no_reversal_small_delta(self):
        """Small delta should not trigger reversal signal."""
        with patch("app.services.signal_service.get_session") as mock_session:
            mock_ctx = AsyncMock()
            mock_ctx.__aenter__ = AsyncMock(return_value=mock_ctx)
            mock_ctx.__aexit__ = AsyncMock(return_value=False)
            mock_execute = AsyncMock()
            mock_execute.mappings.return_value.first.return_value = {
                "recent_score": 0.20,
                "prior_score": 0.15,
            }
            mock_ctx.execute = AsyncMock(return_value=mock_execute)
            mock_session.return_value = mock_ctx

            signals = await self.service._detect_sentiment_reversal("META")
            assert signals == []


# ─── AI Insight Tests ─────────────────────────────────────────────────────────

class TestAIInsightService:
    def setup_method(self):
        from app.services.insight_service import AIInsightService
        self.service = AIInsightService()

    def test_parse_clean_json(self):
        raw = '{"summary": "Strong beat", "beat_miss": "BEAT", "sentiment": "BULLISH", "confidence": 0.85}'
        result = self.service._parse_json_response(raw)
        assert result["beat_miss"] == "BEAT"
        assert result["confidence"] == 0.85

    def test_parse_json_with_markdown_fences(self):
        raw = '```json\n{"summary": "test", "beat_miss": "MISS"}\n```'
        result = self.service._parse_json_response(raw)
        assert result["beat_miss"] == "MISS"

    def test_parse_json_embedded_in_text(self):
        raw = 'Here is my analysis: {"summary": "good", "sentiment": "BULLISH"} Hope that helps!'
        result = self.service._parse_json_response(raw)
        assert result["sentiment"] == "BULLISH"

    def test_parse_invalid_json_raises(self):
        with pytest.raises((ValueError, Exception)):
            self.service._parse_json_response("this is not json at all")

    def test_build_prompt_contains_ticker(self):
        report = {
            "ticker": "AAPL",
            "company_name": "Apple Inc.",
            "fiscalQuarter": "Q4 2024",
            "sector": "Technology",
            "industry": "Consumer Electronics",
            "epsActual": 2.18,
            "epsEstimate": 2.10,
            "epsSurprisePct": 3.8,
            "revenueActual": 119.6e9,
            "revenueEstimate": 117.9e9,
            "revenueSurprisePct": 1.4,
            "guidanceLow": None,
            "guidanceHigh": None,
            "callTranscript": None,
            "pressRelease": None,
        }
        prompt = self.service._build_earnings_prompt(report)
        assert "AAPL" in prompt
        assert "Apple Inc." in prompt
        assert "Q4 2024" in prompt
        assert "+3.8%" in prompt


# ─── FastAPI Endpoint Tests ───────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_health_endpoint():
    """Test the health endpoint returns valid response."""
    with patch("app.utils.database.engine") as mock_engine, \
         patch("app.utils.redis_client.redis_client") as mock_redis:

        mock_conn = AsyncMock()
        mock_conn.__aenter__ = AsyncMock(return_value=mock_conn)
        mock_conn.__aexit__ = AsyncMock(return_value=False)
        mock_conn.execute = AsyncMock()
        mock_engine.connect.return_value = mock_conn
        mock_redis.ping = AsyncMock(return_value=True)

        from app.main import app
        from app.config import settings
        settings.INTERNAL_API_KEY = "test-key"

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(
                "/health",
                headers={"X-Internal-Key": "test-key"}
            )
            assert resp.status_code == 200

@pytest.mark.asyncio
async def test_sentiment_analyze_endpoint():
    """Test the sentiment analyze endpoint."""
    with patch("app.services.sentiment_service.sentiment_analyzer") as mock_analyzer:
        mock_analyzer.analyze_batch = AsyncMock(return_value=[
            {"text": "beats", "score": 0.8, "confidence": 0.9, "label": "BULLISH"}
        ])
        mock_analyzer.aggregate_sentiment = MagicMock(return_value={
            "score": 0.8, "magnitude": 0.8,
            "bullish_count": 1, "bearish_count": 0, "neutral_count": 0,
            "mention_count": 1, "label": "BULLISH"
        })

        from app.main import app
        from app.config import settings
        settings.INTERNAL_API_KEY = "test-key"

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/sentiment/analyze",
                json={"ticker": "AAPL", "texts": ["Apple beats earnings estimates"]},
                headers={"X-Internal-Key": "test-key"}
            )
            assert resp.status_code == 200
            data = resp.json()
            assert "scored" in data
            assert "aggregate" in data
