"""
AI Insight Generation Service.
Generates structured, deterministic financial insights from earnings data.
"""
from __future__ import annotations
import json
import re
from typing import Any
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import settings
from app.utils.database import get_session

logger = structlog.get_logger()

EARNINGS_INSIGHT_SCHEMA = {
    "summary": "2-3 sentence executive summary of the earnings report",
    "key_changes": ["List of 3-5 most significant changes vs prior quarter or consensus"],
    "beat_miss": "BEAT | MISS | IN_LINE",
    "eps_analysis": "Analysis of EPS surprise and what drove it",
    "revenue_analysis": "Analysis of revenue performance",
    "guidance_assessment": "Assessment of forward guidance if available",
    "anomalies": ["Any unusual items, one-time charges, or red flags"],
    "sentiment": "VERY_BULLISH | BULLISH | NEUTRAL | BEARISH | VERY_BEARISH",
    "confidence": "0.0 to 1.0 confidence in analysis",
    "bull_case": "1-2 sentence bull case argument",
    "bear_case": "1-2 sentence bear case argument",
    "key_metrics": {"metric_name": "value and comparison to prior period"}
}

SYSTEM_PROMPT = """You are an elite financial analyst at a top-tier investment bank.
You analyze earnings reports with precision, objectivity, and nuance.
Always respond with valid JSON only — no markdown, no preamble.
Be specific with numbers. Acknowledge uncertainty where data is incomplete.
Follow the exact schema provided."""


class AIInsightService:

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    async def _call_anthropic(self, prompt: str) -> str:
        import anthropic
        client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        msg = await client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=2000,
            system=SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,  # Low temp for determinism
        )
        return msg.content[0].text

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    async def _call_openai(self, prompt: str) -> str:
        from openai import AsyncOpenAI
        client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        resp = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            max_tokens=2000,
            temperature=0.1,
            response_format={"type": "json_object"},
        )
        return resp.choices[0].message.content or ""

    async def _call_llm(self, prompt: str) -> str:
        if settings.LLM_PROVIDER == "anthropic" and settings.ANTHROPIC_API_KEY:
            return await self._call_anthropic(prompt)
        elif settings.OPENAI_API_KEY:
            return await self._call_openai(prompt)
        else:
            raise ValueError("No LLM API key configured")

    def _parse_json_response(self, text: str) -> dict:
        """Robustly parse JSON from LLM output."""
        # Strip markdown code fences if present
        text = re.sub(r'```(?:json)?\s*', '', text).strip()
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            # Try to extract JSON object
            match = re.search(r'\{.*\}', text, re.DOTALL)
            if match:
                return json.loads(match.group())
            raise ValueError(f"Could not parse JSON from LLM response: {text[:200]}")

    async def generate_earnings_insight(self, report_id: str) -> dict:
        """Generate a structured AI insight for an earnings report."""
        # Fetch report data
        async with get_session() as session:
            from sqlalchemy import text
            result = await session.execute(
                text("""
                    SELECT er.*, c.name as company_name, c.sector, c.industry
                    FROM "EarningsReport" er
                    JOIN "Company" c ON c.id = er."companyId"
                    WHERE er.id = :id
                """),
                {"id": report_id}
            )
            row = result.mappings().first()

        if not row:
            raise ValueError(f"Report {report_id} not found")

        prompt = self._build_earnings_prompt(dict(row))
        raw = await self._call_llm(prompt)
        insight = self._parse_json_response(raw)

        # Validate required keys
        required = ["summary", "beat_miss", "sentiment", "confidence"]
        for key in required:
            if key not in insight:
                insight[key] = "N/A"

        # Normalize confidence to float
        try:
            insight["confidence"] = float(insight.get("confidence", 0.5))
        except (ValueError, TypeError):
            insight["confidence"] = 0.5

        logger.info("Earnings insight generated", report_id=report_id, sentiment=insight.get("sentiment"))
        return insight

    def _build_earnings_prompt(self, report: dict) -> str:
        ticker = report.get("ticker", "N/A")
        company = report.get("company_name", ticker)
        quarter = report.get("fiscalQuarter", "N/A")

        eps_actual = report.get("epsActual")
        eps_est = report.get("epsEstimate")
        eps_surprise = report.get("epsSurprisePct")
        rev_actual = report.get("revenueActual")
        rev_est = report.get("revenueEstimate")
        rev_surprise = report.get("revenueSurprisePct")
        transcript = (report.get("callTranscript") or "")[:3000]
        press_release = (report.get("pressRelease") or "")[:2000]

        return f"""Analyze this earnings report and return JSON matching EXACTLY this schema:
{json.dumps(EARNINGS_INSIGHT_SCHEMA, indent=2)}

EARNINGS DATA:
- Company: {company} ({ticker})
- Quarter: {quarter}
- Sector: {report.get('sector', 'N/A')}

EPS:
- Actual: {eps_actual}
- Estimate: {eps_est}
- Surprise: {f'{eps_surprise:+.1f}%' if eps_surprise is not None else 'N/A'}

REVENUE:
- Actual: {f'${rev_actual/1e9:.2f}B' if rev_actual else 'N/A'}
- Estimate: {f'${rev_est/1e9:.2f}B' if rev_est else 'N/A'}
- Surprise: {f'{rev_surprise:+.1f}%' if rev_surprise is not None else 'N/A'}

GUIDANCE LOW/HIGH: {report.get('guidanceLow')} / {report.get('guidanceHigh')}

PRESS RELEASE EXCERPT:
{press_release[:1500] if press_release else 'Not available'}

EARNINGS CALL TRANSCRIPT EXCERPT:
{transcript[:2000] if transcript else 'Not available'}

Respond with valid JSON only."""

    async def generate_sentiment_insight(
        self,
        ticker: str,
        reddit_data: dict,
        news_data: dict
    ) -> dict:
        """Generate a narrative insight from sentiment signals."""
        prompt = f"""Analyze alternative data sentiment for ${ticker} and return JSON:
{{
  "narrative": "2-3 sentence summary of overall sentiment",
  "reddit_summary": "What Reddit is saying",
  "news_summary": "Key news themes",
  "sentiment_trend": "RISING | FALLING | STABLE",
  "risk_flags": ["any concerning signals or anomalies"],
  "opportunity_flags": ["any positive signals"],
  "confidence": 0.0
}}

REDDIT DATA: {json.dumps(reddit_data, default=str)[:1500]}
NEWS DATA: {json.dumps(news_data, default=str)[:1500]}

Return valid JSON only."""

        raw = await self._call_llm(prompt)
        return self._parse_json_response(raw)


ai_insight_service = AIInsightService()
