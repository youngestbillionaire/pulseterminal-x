import { Router, Request, Response } from 'express';
import { z } from 'zod';
import asyncHandler from 'express-async-handler';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { cacheGet, cacheSet, CacheKeys } from '../lib/redis';

export const signalRouter = Router();

// ─── GET /api/signals ─────────────────────────────────────────────────────────
signalRouter.get(
  '/',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const schema = z.object({
      type: z.string().optional(),
      severity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
      ticker: z.string().max(10).optional(),
      hours: z.coerce.number().min(1).max(168).default(24),
      page: z.coerce.number().min(1).default(1),
      limit: z.coerce.number().min(1).max(100).default(20),
    });

    const params = schema.parse(req.query);
    const since = new Date(Date.now() - params.hours * 3600000);

    const where: any = {
      isActive: true,
      detectedAt: { gte: since },
    };
    if (params.type) where.type = params.type;
    if (params.severity) where.severity = params.severity;
    if (params.ticker) where.ticker = params.ticker.toUpperCase();

    const [signals, total] = await prisma.$transaction([
      prisma.signal.findMany({
        where,
        include: {
          company: {
            select: { ticker: true, name: true, logoUrl: true, sector: true },
          },
        },
        orderBy: [{ severity: 'desc' }, { score: 'desc' }, { detectedAt: 'desc' }],
        skip: (params.page - 1) * params.limit,
        take: params.limit,
      }),
      prisma.signal.count({ where }),
    ]);

    res.json({
      signals,
      total,
      page: params.page,
      pages: Math.ceil(total / params.limit),
    });
  })
);

// ─── GET /api/signals/top ─────────────────────────────────────────────────────
signalRouter.get(
  '/top',
  authenticate,
  asyncHandler(async (_req: Request, res: Response) => {
    const cached = await cacheGet<any>('signals:top');
    if (cached) { res.json(cached); return; }

    const signals = await prisma.signal.findMany({
      where: {
        isActive: true,
        severity: { in: ['HIGH', 'CRITICAL'] },
        detectedAt: { gte: new Date(Date.now() - 24 * 3600000) },
      },
      include: {
        company: { select: { ticker: true, name: true, logoUrl: true } },
      },
      orderBy: [{ score: 'desc' }],
      take: 10,
    });

    const result = { signals };
    await cacheSet('signals:top', result, 60);
    res.json(result);
  })
);

// ─── GET /api/signals/:ticker ─────────────────────────────────────────────────
signalRouter.get(
  '/:ticker',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const ticker = req.params.ticker.toUpperCase();
    const cacheKey = CacheKeys.signals(ticker);
    const cached = await cacheGet<any>(cacheKey);
    if (cached) { res.json(cached); return; }

    const signals = await prisma.signal.findMany({
      where: {
        ticker,
        isActive: true,
        detectedAt: { gte: new Date(Date.now() - 7 * 86400000) },
      },
      orderBy: [{ severity: 'desc' }, { detectedAt: 'desc' }],
    });

    const result = { ticker, signals };
    await cacheSet(cacheKey, result, 120);
    res.json(result);
  })
);
