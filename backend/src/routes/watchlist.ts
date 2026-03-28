import { Router, Request, Response } from 'express';
import { z } from 'zod';
import asyncHandler from 'express-async-handler';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { NotFoundError, AppError } from '../middleware/errorHandler';
import { cacheGet, cacheSet, cacheDel, CacheKeys } from '../lib/redis';

export const watchlistRouter = Router();

watchlistRouter.get(
  '/',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const cacheKey = CacheKeys.userWatchlist(req.userId!);
    const cached = await cacheGet<any>(cacheKey);
    if (cached) { res.json(cached); return; }

    const items = await prisma.watchlistItem.findMany({
      where: { userId: req.userId! },
      include: {
        company: {
          select: {
            ticker: true, name: true, logoUrl: true, sector: true, marketCap: true,
          },
        },
      },
      orderBy: { addedAt: 'desc' },
    });

    const enriched = await Promise.all(
      items.map(async (item) => {
        const [latestSignal, latestSentiment] = await Promise.all([
          prisma.signal.findFirst({
            where: { ticker: item.ticker, isActive: true },
            orderBy: { score: 'desc' },
            select: { type: true, severity: true, title: true },
          }),
          prisma.sentimentLog.findFirst({
            where: { ticker: item.ticker },
            orderBy: { recordedAt: 'desc' },
            select: { score: true, mentionCount: true, source: true },
          }),
        ]);
        return { ...item, latestSignal, latestSentiment };
      })
    );

    const result = { watchlist: enriched };
    await cacheSet(cacheKey, result, 60);
    res.json(result);
  })
);

watchlistRouter.post(
  '/',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { ticker, notes } = z.object({
      ticker: z.string().min(1).max(10),
      notes: z.string().max(500).optional(),
    }).parse(req.body);

    const count = await prisma.watchlistItem.count({ where: { userId: req.userId! } });
    const limits: Record<string, number> = { FREE: 5, PRO: 50, ELITE: 500 };
    const limit = limits[req.user!.tier] || 5;
    if (count >= limit) {
      throw new AppError(`Watchlist limit reached (${limit} for ${req.user!.tier} tier)`, 403);
    }

    const company = await prisma.company.findUnique({
      where: { ticker: ticker.toUpperCase() },
    });
    if (!company) throw new NotFoundError('Company');

    const existing = await prisma.watchlistItem.findFirst({
      where: { userId: req.userId!, ticker: ticker.toUpperCase() },
    });
    if (existing) throw new AppError('Already in watchlist', 409);

    const item = await prisma.watchlistItem.create({
      data: {
        userId: req.userId!,
        companyId: company.id,
        ticker: ticker.toUpperCase(),
        notes,
      },
      include: {
        company: { select: { ticker: true, name: true, logoUrl: true } },
      },
    });

    await cacheDel(CacheKeys.userWatchlist(req.userId!));
    res.status(201).json({ item });
  })
);

watchlistRouter.delete(
  '/:ticker',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const ticker = req.params.ticker.toUpperCase();
    const item = await prisma.watchlistItem.findFirst({
      where: { userId: req.userId!, ticker },
    });
    if (!item) throw new NotFoundError('Watchlist item');

    await prisma.watchlistItem.delete({ where: { id: item.id } });
    await cacheDel(CacheKeys.userWatchlist(req.userId!));
    res.json({ message: 'Removed from watchlist' });
  })
);
