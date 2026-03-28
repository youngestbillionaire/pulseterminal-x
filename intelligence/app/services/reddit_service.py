"""
Reddit ingestion using pure HTTP scraping — zero API key required.
Uses Reddit's public JSON endpoints and old.reddit.com search.
"""
from __future__ import annotations
import asyncio
import hashlib
import re
from datetime import datetime, timezone
from typing import List
import structlog
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from app.services.sentiment_service import sentiment_analyzer
from app.utils.database import get_session
from app.utils.redis_client import redis_client

logger = structlog.get_logger()

FINANCIAL_SUBREDDITS = [
    "wallstreetbets", "stocks", "investing", "stockmarket",
    "SecurityAnalysis", "options", "Daytrading", "dividends",
    "ValueInvesting", "pennystocks", "StockMarket", "finance",
]

# Rotate user agents to avoid blocks
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
]

def _get_headers(index: int = 0) -> dict:
    return {
        "User-Agent": USER_AGENTS[index % len(USER_AGENTS)],
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
    }


class RedditScraperService:
    """
    Scrapes Reddit for stock mentions without any API key.
    Uses two strategies:
      1. Reddit search JSON API (public, no auth)
      2. Per-subreddit new posts JSON endpoint
    """

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=3, max=15))
    async def _search_reddit(self, ticker: str, timeframe: str = "day") -> List[dict]:
        """Use Reddit's public search JSON endpoint."""
        queries = [
            f"${ticker}",
            f"{ticker} stock",
            f"{ticker} earnings",
        ]
        posts = []
        seen_ids = set()

        async with httpx.AsyncClient(
            headers=_get_headers(0),
            follow_redirects=True,
            timeout=15,
        ) as client:
            for i, query in enumerate(queries):
                try:
                    url = (
                        f"https://www.reddit.com/search.json"
                        f"?q={query}&sort=new&t={timeframe}&limit=25&type=link"
                    )
                    resp = await client.get(url)
                    if resp.status_code != 200:
                        continue

                    data = resp.json()
                    children = data.get("data", {}).get("children", [])

                    for child in children:
                        p = child.get("data", {})
                        post_id = p.get("id", "")
                        if not post_id or post_id in seen_ids:
                            continue
                        seen_ids.add(post_id)

                        # Filter for finance-related subreddits
                        subreddit = p.get("subreddit", "").lower()
                        if not any(s in subreddit for s in ["stock", "invest", "finance", "wsb", "wallstreet", "option", "trading", "dividend", "market", "security"]):
                            # Still include if it directly mentions the ticker
                            title = p.get("title", "")
                            if f"${ticker.upper()}" not in title.upper() and f" {ticker.upper()} " not in f" {title.upper()} ":
                                continue

                        posts.append(self._parse_post(p))

                    # Small delay between queries
                    await asyncio.sleep(1)

                except Exception as e:
                    logger.warning("Reddit search query failed", query=query, error=str(e))
                    continue

        return posts

    @retry(stop=stop_after_attempt(2), wait=wait_exponential(multiplier=1, min=2, max=8))
    async def _scrape_subreddit(self, subreddit: str, ticker: str) -> List[dict]:
        """Scrape new posts from a specific subreddit and filter by ticker mention."""
        pattern = re.compile(
            r'(?<![A-Z\$])(\$?' + re.escape(ticker.upper()) + r')(?![A-Z])',
            re.IGNORECASE
        )
        posts = []

        async with httpx.AsyncClient(
            headers=_get_headers(1),
            follow_redirects=True,
            timeout=12,
        ) as client:
            try:
                url = f"https://www.reddit.com/r/{subreddit}/new.json?limit=50"
                resp = await client.get(url)
                if resp.status_code != 200:
                    return []

                data = resp.json()
                children = data.get("data", {}).get("children", [])

                for child in children:
                    p = child.get("data", {})
                    text = f"{p.get('title', '')} {p.get('selftext', '')}"
                    if pattern.search(text):
                        posts.append(self._parse_post(p))

            except Exception as e:
                logger.warning("Subreddit scrape failed", subreddit=subreddit, error=str(e))

        return posts

    def _parse_post(self, p: dict) -> dict:
        created_utc = p.get("created_utc", 0)
        try:
            created_at = datetime.fromtimestamp(created_utc, tz=timezone.utc).isoformat()
        except Exception:
            created_at = datetime.now(timezone.utc).isoformat()

        return {
            "post_id": p.get("id", hashlib.md5(p.get("url", "").encode()).hexdigest()[:8]),
            "subreddit": p.get("subreddit", "unknown"),
            "title": (p.get("title") or "")[:500],
            "body": (p.get("selftext") or "")[:2000],
            "score": int(p.get("score") or 0),
            "num_comments": int(p.get("num_comments") or 0),
            "url": f"https://reddit.com{p.get('permalink', '')}" if p.get("permalink") else p.get("url", ""),
            "author": p.get("author", "[deleted]"),
            "created_at": created_at,
        }

    def _deduplicate(self, posts: List[dict]) -> List[dict]:
        seen = set()
        unique = []
        for p in posts:
            if p["post_id"] not in seen:
                seen.add(p["post_id"])
                unique.append(p)
        return unique

    async def fetch_mentions(self, ticker: str) -> List[dict]:
        """
        Main fetch method — runs search + top subreddit scrapes concurrently.
        No API key needed.
        """
        # Rate limit: 1 full scrape per ticker per 10 minutes
        rate_key = f"ratelimit:reddit_scrape:{ticker.upper()}"
        if await redis_client.exists(rate_key):
            logger.debug("Reddit scrape rate limited", ticker=ticker)
            return []
        await redis_client.setex(rate_key, 600, "1")

        # Run search + top 4 subreddits concurrently
        tasks = [
            self._search_reddit(ticker),
            self._scrape_subreddit("wallstreetbets", ticker),
            self._scrape_subreddit("stocks", ticker),
            self._scrape_subreddit("investing", ticker),
            self._scrape_subreddit("stockmarket", ticker),
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        all_posts = []
        for r in results:
            if isinstance(r, list):
                all_posts.extend(r)
            elif isinstance(r, Exception):
                logger.warning("Reddit task failed", error=str(r))

        deduped = self._deduplicate(all_posts)
        logger.info("Reddit scrape complete", ticker=ticker, raw=len(all_posts), unique=len(deduped))
        return deduped

    async def ingest_and_analyze(self, ticker: str) -> dict:
        """Full pipeline: scrape → sentiment → store."""
        mentions = await self.fetch_mentions(ticker)
        if not mentions:
            return {"ticker": ticker, "count": 0, "sentiment": None}

        # Analyze sentiment
        texts = [f"{m['title']}. {m['body'][:200]}" for m in mentions]
        scored = await sentiment_analyzer.analyze_batch(texts)

        for mention, score_data in zip(mentions, scored):
            mention["sentiment"] = score_data["score"]

        aggregate = sentiment_analyzer.aggregate_sentiment(scored)

        # Persist
        async with get_session() as session:
            from sqlalchemy import text

            for m in mentions:
                try:
                    await session.execute(
                        text("""
                            INSERT INTO "RedditMention"
                                (id, "companyId", ticker, subreddit, "postId", title, body,
                                 score, "numComments", sentiment, url, author, "createdAt", "fetchedAt")
                            SELECT
                                gen_random_uuid(), c.id, :ticker, :subreddit, :post_id, :title,
                                :body, :score, :num_comments, :sentiment, :url, :author,
                                :created_at::timestamptz, NOW()
                            FROM "Company" c WHERE c.ticker = :ticker
                            ON CONFLICT ("postId") DO UPDATE
                                SET score = EXCLUDED.score,
                                    "numComments" = EXCLUDED."numComments",
                                    sentiment = EXCLUDED.sentiment
                        """),
                        {
                            "ticker": ticker.upper(),
                            "subreddit": m["subreddit"],
                            "post_id": m["post_id"],
                            "title": m["title"],
                            "body": m.get("body", ""),
                            "score": m["score"],
                            "num_comments": m["num_comments"],
                            "sentiment": m.get("sentiment"),
                            "url": m["url"][:1000],
                            "author": m.get("author", "")[:200],
                            "created_at": m["created_at"],
                        }
                    )
                except Exception as e:
                    logger.warning("Reddit mention insert failed", post_id=m.get("post_id"), error=str(e))

            # Log aggregate sentiment
            try:
                await session.execute(
                    text("""
                        INSERT INTO "SentimentLog"
                            (id, "companyId", ticker, source, score, magnitude,
                             "bullishCount", "bearishCount", "neutralCount", "mentionCount",
                             "windowHours", "recordedAt", "createdAt")
                        SELECT
                            gen_random_uuid(), c.id, :ticker, 'REDDIT',
                            :score, :magnitude, :bullish, :bearish, :neutral, :mentions,
                            24, NOW(), NOW()
                        FROM "Company" c WHERE c.ticker = :ticker
                    """),
                    {
                        "ticker": ticker.upper(),
                        "score": aggregate["score"],
                        "magnitude": aggregate["magnitude"],
                        "bullish": aggregate["bullish_count"],
                        "bearish": aggregate["bearish_count"],
                        "neutral": aggregate["neutral_count"],
                        "mentions": aggregate["mention_count"],
                    }
                )
            except Exception as e:
                logger.warning("Sentiment log insert failed", ticker=ticker, error=str(e))

            await session.commit()

        return {
            "ticker": ticker,
            "count": len(mentions),
            "sentiment": aggregate,
            "sample": mentions[:3],
        }


reddit_service = RedditScraperService()
