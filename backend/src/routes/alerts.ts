// ─── alerts.ts ────────────────────────────────────────────────────────────────
import { Router, Request, Response } from 'express';
import { z } from 'zod';
import asyncHandler from 'express-async-handler';
import { prisma } from '../lib/prisma';
import { authenticate, requireTier } from '../middleware/auth';
import { NotFoundError, ForbiddenError } from '../middleware/errorHandler';

export const alertRouter = Router();

const alertSchema = z.object({
  ticker: z.string().max(10).optional(),
  type: z.enum(['PRICE_TARGET', 'EARNINGS_RELEASE', 'SENTIMENT_THRESHOLD', 'SIGNAL_DETECTED', 'VOLUME_SPIKE']),
  condition: z.record(z.unknown()),
  threshold: z.number().optional(),
  channels: z.array(z.enum(['in_app', 'email'])).default(['in_app']),
  cooldownMin: z.number().min(5).max(1440).default(60),
});

alertRouter.get(
  '/',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const alerts = await prisma.alert.findMany({
      where: { userId: req.userId! },
      include: {
        company: { select: { ticker: true, name: true, logoUrl: true } },
        logs: { orderBy: { sentAt: 'desc' }, take: 1 },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ alerts });
  })
);

alertRouter.post(
  '/',
  authenticate,
  requireTier('PRO', 'ELITE'),
  asyncHandler(async (req: Request, res: Response) => {
    const body = alertSchema.parse(req.body);

    // Check alert limit per tier
    const limits: Record<string, number> = { PRO: 20, ELITE: 100 };
    const count = await prisma.alert.count({ where: { userId: req.userId!, isActive: true } });
    const limit = limits[req.user!.tier] || 0;
    if (count >= limit) {
      throw new ForbiddenError(`Alert limit reached (${limit} for ${req.user!.tier} tier)`);
    }

    let companyId: string | undefined;
    if (body.ticker) {
      const company = await prisma.company.findUnique({ where: { ticker: body.ticker.toUpperCase() } });
      companyId = company?.id;
    }

    const alert = await prisma.alert.create({
      data: {
        userId: req.userId!,
        companyId,
        ticker: body.ticker?.toUpperCase(),
        type: body.type,
        condition: body.condition,
        threshold: body.threshold,
        channels: body.channels,
        cooldownMin: body.cooldownMin,
      },
    });

    res.status(201).json({ alert });
  })
);

alertRouter.delete(
  '/:id',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const alert = await prisma.alert.findFirst({
      where: { id: req.params.id, userId: req.userId! },
    });
    if (!alert) throw new NotFoundError('Alert');

    await prisma.alert.delete({ where: { id: req.params.id } });
    res.json({ message: 'Alert deleted' });
  })
);
