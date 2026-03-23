import { Router, Request, Response } from 'express';
import { z } from 'zod';
import asyncHandler from 'express-async-handler';
import { prisma } from '../lib/prisma';
import { authenticate, requireTier } from '../middleware/auth';
import { cacheGet, cacheSet, CacheKeys } from '../lib/redis';

export const sentimentRouter = Router();

// ─── GET /api/sentiment/:ticker ───────────────────────────────────────────────
sentimentRouter.get(
  '/:ticker',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const ticker = req.params.ticker.toUpperCase();
    const source = req.query.source as string | undefined;
    const hours = Math.min(Number(req.query.hours) || 24, 168);
    const since = new Date(Date.now() - hours * 3600000);

    const cacheKey = CacheKeys.sentiment(ticker, source || 'all');
    const cached = await cacheGet<any>(cacheKey);
    if (cached) return res.json(cached);

    const where: any = { ticker, recordedAt: { gte: since } };
    if (source) where.source = source.toUpperCase();

    const logs = await prisma.sentimentLog.findMany({
      where,
      orderBy: { recordedAt: 'asc' },
    });

    // Compute aggregate stats
    const aggregate = logs.reduce(
      (acc, log) => ({
        totalMentions: acc.totalMentions + log.mentionCount,
        bullish: acc.bullish + log.bullishCount,
        bearish: acc.bearish + log.bearish + log.bearishCount,
        neutral: acc.neutral + log.neutralCount,
        avgScore: acc.avgScore + log.score,
        count: acc.count + 1,
      }),
      { totalMentions: 0, bullish: 0, bearish: 0, neutral: 0, avgScore: 0, count: 0 }
    );

    if (aggregate.count > 0) {
      aggregate.avgScore = aggregate.avgScore / aggregate.count;
    }

    const result = { ticker, logs, aggregate, hours };
    await cacheSet(cacheKey, result, 180); // 3 min
    res.json(result);
  })
);

// ─── GET /api/sentiment/leaderboard/bullish ───────────────────────────────────
sentimentRouter.get(
  '/leaderboard/bullish',
  authenticate,
  asyncHandler(async (_req: Request, res: Response) => {
    const cached = await cacheGet<any>('sentiment:leaderboard:bullish');
    if (cached) return res.json(cached);

    const data = await prisma.$queryRaw<any[]>`
      SELECT
        sl.ticker,
        c.name,
        c."logoUrl",
        c.sector,
        AVG(sl.score) as avg_score,
        SUM(sl."mentionCount") as total_mentions,
        AVG(sl."velocityScore") as velocity
      FROM "SentimentLog" sl
      JOIN "Company" c ON c.ticker = sl.ticker
      WHERE sl."recordedAt" > NOW() - INTERVAL '24 hours'
      GROUP BY sl.ticker, c.name, c."logoUrl", c.sector
      HAVING AVG(sl.score) > 0.2
      ORDER BY avg_score DESC, total_mentions DESC
      LIMIT 20
    `;

    const result = { leaderboard: data };
    await cacheSet('sentiment:leaderboard:bullish', result, 300);
    res.json(result);
  })
);

// ─── GET /api/sentiment/leaderboard/bearish ───────────────────────────────────
sentimentRouter.get(
  '/leaderboard/bearish',
  authenticate,
  asyncHandler(async (_req: Request, res: Response) => {
    const cached = await cacheGet<any>('sentiment:leaderboard:bearish');
    if (cached) return res.json(cached);

    const data = await prisma.$queryRaw<any[]>`
      SELECT
        sl.ticker,
        c.name,
        c."logoUrl",
        c.sector,
        AVG(sl.score) as avg_score,
        SUM(sl."mentionCount") as total_mentions
      FROM "SentimentLog" sl
      JOIN "Company" c ON c.ticker = sl.ticker
      WHERE sl."recordedAt" > NOW() - INTERVAL '24 hours'
      GROUP BY sl.ticker, c.name, c."logoUrl", c.sector
      HAVING AVG(sl.score) < -0.2
      ORDER BY avg_score ASC
      LIMIT 20
    `;

    const result = { leaderboard: data };
    await cacheSet('sentiment:leaderboard:bearish', result, 300);
    res.json(result);
  })
);
