import { Router, Request, Response } from 'express';
import { z } from 'zod';
import asyncHandler from 'express-async-handler';
import { prisma } from '../lib/prisma';
import { authenticate, requireTier } from '../middleware/auth';
import { NotFoundError } from '../middleware/errorHandler';
import { cacheGet, cacheSet, CacheKeys } from '../lib/redis';
import { intelligenceClient } from '../services/intelligenceClient';

export const earningsRouter = Router();

// ─── GET /api/earnings/calendar ───────────────────────────────────────────────
earningsRouter.get(
  '/calendar',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().parse(req.query.date);
    const weeksAhead = Math.min(Number(req.query.weeks) || 2, 8);

    const startDate = dateStr ? new Date(dateStr) : new Date();
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate.getTime() + weeksAhead * 7 * 86400000);

    const cacheKey = CacheKeys.earningsCalendar(`${startDate.toISOString()}-${weeksAhead}`);
    const cached = await cacheGet<any>(cacheKey);
    if (cached) { res.json(cached); return; }

    const earnings = await prisma.earningsReport.findMany({
      where: {
        reportDate: { gte: startDate, lte: endDate },
        status: { not: 'REVISED' },
      },
      include: {
        company: {
          select: { ticker: true, name: true, logoUrl: true, sector: true, marketCap: true },
        },
      },
      orderBy: [{ reportDate: 'asc' }, { company: { marketCap: 'desc' } }],
    });

    const grouped: Record<string, any[]> = {};
    for (const e of earnings) {
      const key = e.reportDate.toISOString().split('T')[0];
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(e);
    }

    const result = { calendar: grouped, total: earnings.length };
    await cacheSet(cacheKey, result, 900);
    res.json(result);
  })
);

// ─── GET /api/earnings/:ticker ────────────────────────────────────────────────
earningsRouter.get(
  '/:ticker',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const ticker = req.params.ticker.toUpperCase();
    const limit = Math.min(Number(req.query.limit) || 8, 20);

    const cacheKey = CacheKeys.earnings(ticker);
    const cached = await cacheGet<any>(cacheKey);
    if (cached) { res.json(cached); return; }

    const earnings = await prisma.earningsReport.findMany({
      where: { ticker },
      orderBy: { reportDate: 'desc' },
      take: limit,
    });

    if (!earnings.length) throw new NotFoundError('Earnings data');

    const result = { ticker, earnings };
    await cacheSet(cacheKey, result, 300);
    res.json(result);
  })
);

// ─── GET /api/earnings/:ticker/latest ─────────────────────────────────────────
earningsRouter.get(
  '/:ticker/latest',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const ticker = req.params.ticker.toUpperCase();

    const report = await prisma.earningsReport.findFirst({
      where: { ticker, status: 'REPORTED' },
      orderBy: { reportDate: 'desc' },
      include: {
        company: {
          select: { name: true, sector: true, logoUrl: true },
        },
      },
    });

    if (!report) throw new NotFoundError('Latest earnings');
    res.json({ report });
  })
);

// ─── GET /api/earnings/:ticker/:reportId/insight ──────────────────────────────
earningsRouter.get(
  '/:ticker/:reportId/insight',
  authenticate,
  requireTier('PRO', 'ELITE'),
  asyncHandler(async (req: Request, res: Response) => {
    const { ticker, reportId } = req.params;

    const report = await prisma.earningsReport.findFirst({
      where: { id: reportId, ticker: ticker.toUpperCase() },
    });

    if (!report) throw new NotFoundError('Earnings report');

    if (report.aiInsight) {
      res.json({ insight: report.aiInsight, cached: true });
      return;
    }

    const insight = await intelligenceClient.generateEarningsInsight(reportId);

    await prisma.earningsReport.update({
      where: { id: reportId },
      data: { aiInsight: insight },
    });

    res.json({ insight, cached: false });
  })
);

// ─── GET /api/earnings/:ticker/upcoming ───────────────────────────────────────
earningsRouter.get(
  '/:ticker/upcoming',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const ticker = req.params.ticker.toUpperCase();

    const next = await prisma.earningsReport.findFirst({
      where: {
        ticker,
        reportDate: { gte: new Date() },
        status: { in: ['PENDING', 'CONFIRMED'] },
      },
      orderBy: { reportDate: 'asc' },
    });

    res.json({ upcoming: next });
  })
);
