import { Router, Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';

export const healthRouter = Router();

healthRouter.get(
  '/',
  asyncHandler(async (_req: Request, res: Response) => {
    const start = Date.now();

    const checks: Record<string, any> = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
    };

    // DB check
    try {
      await prisma.$queryRaw`SELECT 1`;
      checks.database = { status: 'ok', latency: `${Date.now() - start}ms` };
    } catch {
      checks.database = { status: 'error' };
      checks.status = 'degraded';
    }

    // Redis check
    try {
      const t = Date.now();
      await redis.ping();
      checks.redis = { status: 'ok', latency: `${Date.now() - t}ms` };
    } catch {
      checks.redis = { status: 'error' };
      checks.status = 'degraded';
    }

    const code = checks.status === 'ok' ? 200 : 503;
    res.status(code).json(checks);
  })
);

// Liveness probe (no deps checked)
healthRouter.get('/live', (_req, res) => res.json({ status: 'ok' }));
// Readiness probe
healthRouter.get('/ready', asyncHandler(async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ status: 'ready' });
}));
