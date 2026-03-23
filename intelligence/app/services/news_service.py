"""
News ingestion from multiple sources: NewsAPI, RSS feeds, web scraping fallback.
"""
from __future__ import annotations
import asyncio
import hashlib
from datetime import datetime, timezone
from typing import List
import structlog
import httpx
import feedparser
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import settings
from app.services.sentiment_service import sentiment_analyzer
from app.utils.database import get_session

logger = structlog.get_logger()

# Financial news RSS feeds
RSS_FEEDS = {
    "seeking_alpha": "https://seekingalpha.com/feed.xml",
    "marketwatch": "https://feeds.marketwatch.com/marketwatch/topstories/",
    "reuters_business": "https://feeds.reuters.com/reuters/businessNews",
    "ft": "https://www.ft.com/rss/home/uk",
    "yahoo_finance": "https://finance.yahoo.com/news/rssindex",
}


class NewsIngestionService:

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=8))
    async def fetch_from_newsapi(self, ticker: str, company_name: str = "") -> List[dict]:
        if not settings.NEWS_API_KEY:
            return []

        query = f"{ticker} OR {company_name}" if company_name else ticker
        url = "https://newsapi.org/v2/everything"
        params = {
            "q": query,
            "language": "en",
            "sortBy": "publishedAt",
            "pageSize": 50,
            "apiKey": settings.NEWS_API_KEY,
        }

        async with httpx.AsyncClient() as client:
            resp = await client.get(url, params=params, timeout=10)
            resp.raise_for_status()
            data = resp.json()

        articles = data.get("articles", [])
        return [
            {
                "headline": a["title"],
                "summary": a.get("description", ""),
                "content": a.get("content", ""),
                "source": a["source"]["name"],
                "url": a["url"],
                "author": a.get("author"),
                "image_url": a.get("urlToImage"),
                "published_at": a["publishedAt"],
                "tags": [ticker],
            }
            for a in articles
            if a.get("title") and a.get("url")
        ]

    async def fetch_from_rss(self, ticker: str) -> List[dict]:
        """Fetch and filter RSS feeds for ticker mentions."""
        results = []
        ticker_upper = ticker.upper()

        async def _fetch_feed(name: str, url: str):
            try:
                loop = asyncio.get_event_loop()
                feed = await loop.run_in_executor(None, feedparser.parse, url)
                for entry in feed.entries[:20]:
                    text = f"{entry.get('title', '')} {entry.get('summary', '')}".upper()
                    if ticker_upper in text or f"${ticker_upper}" in text:
                        results.append({
                            "headline": entry.get("title", "")[:500],
                            "summary": entry.get("summary", "")[:1000],
                            "content": None,
                            "source": name.replace("_", " ").title(),
                            "url": entry.get("link", ""),
                            "author": entry.get("author"),
                            "image_url": None,
                            "published_at": entry.get("published", datetime.now(timezone.utc).isoformat()),
                            "tags": [ticker],
                        })
            except Exception as e:
                logger.warning("RSS feed failed", feed=name, error=str(e))

        await asyncio.gather(*[_fetch_feed(n, u) for n, u in RSS_FEEDS.items()])
        return results

    def _deduplicate(self, articles: List[dict]) -> List[dict]:
        seen = set()
        unique = []
        for a in articles:
            key = hashlib.md5(a["url"].encode()).hexdigest()
            if key not in seen:
                seen.add(key)
                unique.append(a)
        return unique

    async def ingest_and_analyze(self, ticker: str, company_name: str = "") -> dict:
        """Full pipeline: fetch → deduplicate → analyze → store."""
        # Fetch from all sources concurrently
        newsapi_results, rss_results = await asyncio.gather(
            self.fetch_from_newsapi(ticker, company_name),
            self.fetch_from_rss(ticker),
            return_exceptions=True,
        )

        articles = []
        if isinstance(newsapi_results, list):
            articles.extend(newsapi_results)
        if isinstance(rss_results, list):
            articles.extend(rss_results)

        articles = self._deduplicate(articles)
        if not articles:
            return {"ticker": ticker, "count": 0}

        # Sentiment analysis
        texts = [f"{a['headline']}. {a.get('summary', '')[:200]}" for a in articles]
        scored = await sentiment_analyzer.analyze_batch(texts)

        for article, score in zip(articles, scored):
            article["sentiment"] = score["score"]
            article["relevance"] = score["confidence"]

        # Persist
        async with get_session() as session:
            from sqlalchemy import text
            for a in articles:
                try:
                    pub_ts = a.get("published_at")
                    if isinstance(pub_ts, str):
                        from dateutil import parser as dateparser
                        pub_dt = dateparser.parse(pub_ts)
                    else:
                        pub_dt = datetime.now(timezone.utc)

                    await session.execute(
                        text("""
                            INSERT INTO "NewsItem"
                                (id, "companyId", ticker, headline, summary, content, source,
                                 url, author, "imageUrl", sentiment, relevance, "publishedAt",
                                 "fetchedAt", tags)
                            SELECT
                                gen_random_uuid(), c.id, :ticker, :headline, :summary, :content,
                                :source, :url, :author, :image_url, :sentiment, :relevance,
                                :published_at::timestamptz, NOW(), ARRAY[:ticker]
                            FROM "Company" c WHERE c.ticker = :ticker
                            ON CONFLICT (url) DO UPDATE
                                SET sentiment = EXCLUDED.sentiment,
                                    "fetchedAt" = NOW()
                        """),
                        {
                            "ticker": ticker.upper(),
                            "headline": a["headline"][:500],
                            "summary": (a.get("summary") or "")[:2000],
                            "content": (a.get("content") or "")[:10000],
                            "source": a["source"][:100],
                            "url": a["url"][:1000],
                            "author": (a.get("author") or "")[:200],
                            "image_url": (a.get("image_url") or "")[:500] or None,
                            "sentiment": a.get("sentiment"),
                            "relevance": a.get("relevance"),
                            "published_at": pub_dt,
                        }
                    )
                except Exception as e:
                    logger.warning("News insert failed", url=a.get("url"), error=str(e))

            await session.commit()

        logger.info("News ingestion complete", ticker=ticker, count=len(articles))
        return {"ticker": ticker, "count": len(articles)}


news_service = NewsIngestionService()
