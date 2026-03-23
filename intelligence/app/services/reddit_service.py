"""
Reddit ingestion using PRAW with async-friendly wrapper and fallback scraping.
"""
from __future__ import annotations
import asyncio
import re
from datetime import datetime, timezone
from typing import List, Optional
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import settings
from app.services.sentiment_service import sentiment_analyzer
from app.utils.database import get_session
from app.utils.redis_client import redis_client

logger = structlog.get_logger()

FINANCIAL_SUBREDDITS = [
    "wallstreetbets", "stocks", "investing", "stockmarket",
    "SecurityAnalysis", "options", "Daytrading", "dividends",
    "ValueInvesting", "pennystocks",
]

MENTION_PATTERN_TEMPLATE = r'\b{ticker}\b'


class RedditIngestionService:
    def __init__(self):
        self._reddit = None

    def _get_reddit(self):
        if self._reddit is None:
            try:
                import praw
                self._reddit = praw.Reddit(
                    client_id=settings.REDDIT_CLIENT_ID,
                    client_secret=settings.REDDIT_CLIENT_SECRET,
                    user_agent=settings.REDDIT_USER_AGENT,
                    read_only=True,
                )
                logger.info("PRAW Reddit client initialized")
            except Exception as e:
                logger.error("PRAW init failed", error=str(e))
                self._reddit = None
        return self._reddit

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    async def fetch_mentions(self, ticker: str, hours: int = 24) -> List[dict]:
        """Fetch Reddit posts mentioning ticker from the last N hours."""
        rate_key = f"ratelimit:reddit:{ticker}"
        # Basic rate limiting: 1 call per ticker per 10 minutes
        if await redis_client.exists(rate_key):
            logger.debug("Reddit rate limit hit, returning cached", ticker=ticker)
            return []
        await redis_client.setex(rate_key, 600, "1")

        loop = asyncio.get_event_loop()
        try:
            mentions = await loop.run_in_executor(
                None, self._fetch_sync, ticker, hours
            )
            return mentions
        except Exception as e:
            logger.error("Reddit fetch failed", ticker=ticker, error=str(e))
            return await self._scrape_fallback(ticker)

    def _fetch_sync(self, ticker: str, hours: int) -> List[dict]:
        reddit = self._get_reddit()
        if not reddit:
            return []

        pattern = re.compile(MENTION_PATTERN_TEMPLATE.format(ticker=re.escape(ticker)), re.IGNORECASE)
        mentions = []
        cutoff_ts = datetime.now(timezone.utc).timestamp() - (hours * 3600)

        for subreddit_name in FINANCIAL_SUBREDDITS[:5]:  # Limit subreddits per call
            try:
                subreddit = reddit.subreddit(subreddit_name)
                for post in subreddit.new(limit=100):
                    if post.created_utc < cutoff_ts:
                        continue
                    text = f"{post.title} {post.selftext or ''}"
                    if pattern.search(text):
                        mentions.append({
                            "post_id": post.id,
                            "subreddit": subreddit_name,
                            "title": post.title[:500],
                            "body": (post.selftext or "")[:2000],
                            "score": post.score,
                            "num_comments": post.num_comments,
                            "url": f"https://reddit.com{post.permalink}",
                            "author": str(post.author) if post.author else "[deleted]",
                            "created_at": datetime.fromtimestamp(post.created_utc, tz=timezone.utc).isoformat(),
                        })
            except Exception as e:
                logger.warning("Subreddit fetch failed", subreddit=subreddit_name, error=str(e))
                continue

        return mentions

    async def _scrape_fallback(self, ticker: str) -> List[dict]:
        """Fallback: scrape Reddit search via JSON API."""
        import httpx
        try:
            url = f"https://www.reddit.com/search.json?q={ticker}+stock&sort=new&limit=25&t=day"
            async with httpx.AsyncClient(headers={"User-Agent": settings.REDDIT_USER_AGENT}) as client:
                resp = await client.get(url, timeout=10)
                data = resp.json()

            posts = data.get("data", {}).get("children", [])
            return [
                {
                    "post_id": p["data"]["id"],
                    "subreddit": p["data"]["subreddit"],
                    "title": p["data"]["title"][:500],
                    "body": (p["data"].get("selftext") or "")[:2000],
                    "score": p["data"]["score"],
                    "num_comments": p["data"]["num_comments"],
                    "url": f"https://reddit.com{p['data']['permalink']}",
                    "author": p["data"].get("author", "[deleted]"),
                    "created_at": datetime.fromtimestamp(
                        p["data"]["created_utc"], tz=timezone.utc
                    ).isoformat(),
                }
                for p in posts
                if isinstance(p.get("data"), dict)
            ]
        except Exception as e:
            logger.error("Reddit scrape fallback failed", ticker=ticker, error=str(e))
            return []

    async def ingest_and_analyze(self, ticker: str) -> dict:
        """Full pipeline: fetch → analyze sentiment → store."""
        mentions = await self.fetch_mentions(ticker)
        if not mentions:
            return {"ticker": ticker, "count": 0, "sentiment": None}

        # Analyze sentiment on titles + body snippets
        texts = [f"{m['title']}. {m['body'][:200]}" for m in mentions]
        scored = await sentiment_analyzer.analyze_batch(texts)

        for mention, score_data in zip(mentions, scored):
            mention["sentiment"] = score_data["score"]

        aggregate = sentiment_analyzer.aggregate_sentiment(scored)

        # Persist to DB via SQLAlchemy
        async with get_session() as session:
            from sqlalchemy import text
            # Upsert reddit mentions
            for m in mentions:
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
                        "url": m["url"],
                        "author": m.get("author", ""),
                        "created_at": m["created_at"],
                    }
                )

            # Log aggregate sentiment
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
            await session.commit()

        logger.info("Reddit ingestion complete", ticker=ticker, count=len(mentions))
        return {
            "ticker": ticker,
            "count": len(mentions),
            "sentiment": aggregate,
            "sample": mentions[:3],
        }


reddit_service = RedditIngestionService()
