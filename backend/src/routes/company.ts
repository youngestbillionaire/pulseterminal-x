import { Router, Request, Response } from 'express';
import { z } from 'zod';
import asyncHandler from 'express-async-handler';
import { prisma } from '../lib/prisma';
import { authenticate, requireTier } from '../middleware/auth';
import { NotFoundError } from '../middleware/errorHandler';
import { cacheGet, cacheSet, CacheKeys } from '../lib/redis';

export const companyRouter = Router();

// ─── GET /api/companies/search ────────────────────────────────────────────────
companyRouter.get(
  '/search',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const q = z.string().min(1).max(50).parse(req.query.q);
    const limit = Math.min(Number(req.query.limit) || 10, 20);

    const results = await prisma.company.findMany({
      where: {
        isActive: true,
        OR: [
          { ticker: { contains: q.toUpperCase() } },
          { name: { contains: q, mode: 'insensitive' } },
        ],
      },
      select: {
        id: true, ticker: true, name: true, sector: true,
        exchange: true, logoUrl: true, marketCap: true,
      },
      take: limit,
      orderBy: [{ marketCap: 'desc' }],
    });

    if (req.userId) {
      prisma.searchHistory.create({
        data: { userId: req.userId, query: q, type: 'company' },
      }).catch(() => {});
    }

    res.json({ results });
  })
);

// ─── GET /api/companies/trending ─────────────────────────────────────────────
companyRouter.get(
  '/trending',
  authenticate,
  asyncHandler(async (_req: Request, res: Response) => {
    const cached = await cacheGet<any[]>(CacheKeys.trending());
    if (cached) { res.json({ tickers: cached }); return; }

    const trending = await prisma.$queryRaw<any[]>`
      SELECT c.ticker, c.name, c."logoUrl", c.sector,
             COUNT(DISTINCT s.id) as signal_count,
             AVG(sl.score) as avg_sentiment,
             SUM(rm."numComments") as reddit_activity
      FROM "Company" c
      LEFT JOIN "Signal" s ON s."companyId" = c.id AND s."detectedAt" > NOW() - INTERVAL '24 hours'
      LEFT JOIN "SentimentLog" sl ON sl."companyId" = c.id AND sl."recordedAt" > NOW() - INTERVAL '24 hours'
      LEFT JOIN "RedditMention" rm ON rm."companyId" = c.id AND rm."createdAt" > NOW() - INTERVAL '24 hours'
      WHERE c."isActive" = true
      GROUP BY c.id, c.ticker, c.name, c."logoUrl", c.sector
      ORDER BY signal_count DESC, reddit_activity DESC NULLS LAST
      LIMIT 20
    `;

    await cacheSet(CacheKeys.trending(), trending, 300);
    res.json({ tickers: trending });
  })
);

// ─── GET /api/companies/:ticker ───────────────────────────────────────────────
companyRouter.get(
  '/:ticker',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const ticker = req.params.ticker.toUpperCase();
    const cached = await cacheGet<any>(CacheKeys.company(ticker));
    if (cached) { res.json(cached); return; }

    const company = await prisma.company.findUnique({
      where: { ticker },
      include: {
        earnings: {
          orderBy: { reportDate: 'desc' },
          take: 8,
          select: {
            id: true, fiscalQuarter: true, reportDate: true,
            epsActual: true, epsEstimate: true, epsSurprisePct: true,
            revenueActual: true, revenueEstimate: true, revenueSurprisePct: true,
            status: true, aiInsight: true,
          },
        },
        sentimentLogs: {
          where: { recordedAt: { gte: new Date(Date.now() - 7 * 86400000) } },
          orderBy: { recordedAt: 'desc' },
          take: 50,
        },
        signals: {
          where: { isActive: true },
          orderBy: { detectedAt: 'desc' },
          take: 10,
        },
        _count: { select: { watchlist: true } },
      },
    });

    if (!company) throw new NotFoundError('Company');

    const result = { company };
    await cacheSet(CacheKeys.company(ticker), result, 120);
    res.json(result);
  })
);

// ─── GET /api/companies/:ticker/price-history ─────────────────────────────────
companyRouter.get(
  '/:ticker/price-history',
  authenticate,
  requireTier('PRO', 'ELITE'),
  asyncHandler(async (req: Request, res: Response) => {
    const ticker = req.params.ticker.toUpperCase();
    const days = Math.min(Number(req.query.days) || 30, 365);
    const since = new Date(Date.now() - days * 86400000);

    const prices = await prisma.pricePoint.findMany({
      where: { ticker, timestamp: { gte: since } },
      orderBy: { timestamp: 'asc' },
      select: { timestamp: true, open: true, high: true, low: true, close: true, volume: true },
    });

    res.json({ ticker, prices, days });
  })
);

// ─── GET /api/companies/:ticker/news ─────────────────────────────────────────
companyRouter.get(
  '/:ticker/news',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const ticker = req.params.ticker.toUpperCase();
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(Number(req.query.limit) || 20, 50);

    const [news, total] = await prisma.$transaction([
      prisma.newsItem.findMany({
        where: { ticker },
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, headline: true, summary: true, source: true,
          url: true, sentiment: true, publishedAt: true, imageUrl: true, tags: true,
        },
      }),
      prisma.newsItem.count({ where: { ticker } }),
    ]);

    res.json({ news, total, page, pages: Math.ceil(total / limit) });
  })
);

// ─── GET /api/companies/:ticker/reddit ────────────────────────────────────────
companyRouter.get(
  '/:ticker/reddit',
  authenticate,
  requireTier('PRO', 'ELITE'),
  asyncHandler(async (req: Request, res: Response) => {
    const ticker = req.params.ticker.toUpperCase();
    const hours = Math.min(Number(req.query.hours) || 24, 168);
    const since = new Date(Date.now() - hours * 3600000);

    const mentions = await prisma.redditMention.findMany({
      where: { ticker, createdAt: { gte: since } },
      orderBy: { score: 'desc' },
      take: 50,
      select: {
        id: true, subreddit: true, title: true, score: true,
        numComments: true, sentiment: true, url: true, createdAt: true,
      },
    });

    const stats = await prisma.$queryRaw<any[]>`
      SELECT
        COUNT(*) as total_mentions,
        AVG(sentiment) as avg_sentiment,
        SUM(score) as total_score,
        SUM("numComments") as total_comments
      FROM "RedditMention"
      WHERE ticker = ${ticker}
        AND "createdAt" >= ${since}
    `;

    res.json({ mentions, stats: stats[0], hours });
  })
);
