import { Queue, Worker, QueueEvents } from 'bullmq';
import { redis } from '../lib/redis';
import { logger } from '../lib/logger';
import { prisma } from '../lib/prisma';
import { intelligenceClient } from '../services/intelligenceClient';
import { broadcastSignal, broadcastSentimentUpdate } from '../lib/websocket';
import cron from 'node-cron';

const connection = { host: process.env.REDIS_HOST || 'localhost', port: 6379 };

// ─── Queue definitions ────────────────────────────────────────────────────────
export const ingestionQueue = new Queue('ingestion', { connection });
export const signalQueue    = new Queue('signals', { connection });
export const alertQueue     = new Queue('alerts', { connection });
export const insightQueue   = new Queue('insights', { connection });

// ─── Ingestion Worker ─────────────────────────────────────────────────────────
const ingestionWorker = new Worker(
  'ingestion',
  async (job) => {
    const { ticker, type } = job.data;
    const start = Date.now();

    try {
      if (type === 'reddit') {
        const result = await intelligenceClient.ingestReddit(ticker);
        logger.info('Reddit ingestion complete', { ticker, count: result.count });
      } else if (type === 'news') {
        const result = await intelligenceClient.ingestNews(ticker);
        logger.info('News ingestion complete', { ticker, count: result.count });
      }

      await prisma.jobLog.create({
        data: {
          jobName: `ingestion:${type}:${ticker}`,
          status: 'SUCCESS',
          duration: Date.now() - start,
        },
      });
    } catch (err: any) {
      await prisma.jobLog.create({
        data: {
          jobName: `ingestion:${type}:${ticker}`,
          status: 'FAILED',
          error: err.message,
          duration: Date.now() - start,
        },
      });
      throw err;
    }
  },
  { connection, concurrency: 5 }
);

// ─── Signal Detection Worker ──────────────────────────────────────────────────
const signalWorker = new Worker(
  'signals',
  async (job) => {
    const { ticker } = job.data;

    const signals = await intelligenceClient.detectSignals(ticker);

    for (const sig of signals) {
      // Upsert signal
      const company = await prisma.company.findUnique({ where: { ticker } });
      if (!company) continue;

      const created = await prisma.signal.create({
        data: {
          companyId: company.id,
          ticker,
          type: sig.type,
          severity: sig.severity,
          title: sig.title,
          description: sig.description,
          data: sig.data,
          score: sig.score,
        },
      });

      // Broadcast via WebSocket
      broadcastSignal(ticker, created);

      // Queue alert checks
      await alertQueue.add('check-alerts', { ticker, signalId: created.id }, {
        priority: sig.severity === 'CRITICAL' ? 1 : 5,
      });
    }
  },
  { connection, concurrency: 10 }
);

// ─── Alert Worker ─────────────────────────────────────────────────────────────
const alertWorker = new Worker(
  'alerts',
  async (job) => {
    const { ticker, signalId } = job.data;

    const activeAlerts = await prisma.alert.findMany({
      where: {
        ticker,
        isActive: true,
        type: 'SIGNAL_DETECTED',
        OR: [
          { lastFired: null },
          { lastFired: { lt: new Date(Date.now() - 3600000) } }, // 1hr cooldown
        ],
      },
      include: { user: { select: { id: true, email: true } } },
    });

    for (const alert of activeAlerts) {
      // Fire alert
      const log = await prisma.alertLog.create({
        data: {
          alertId: alert.id,
          userId: alert.userId,
          message: `Signal detected for ${ticker}`,
          data: { signalId },
          channel: 'in_app',
        },
      });

      await prisma.alert.update({
        where: { id: alert.id },
        data: { lastFired: new Date() },
      });

      // WebSocket push
      const { broadcastAlertToUser } = await import('../lib/websocket');
      broadcastAlertToUser(alert.userId, { ...log, ticker });
    }
  },
  { connection, concurrency: 20 }
);

// ─── Error handling ───────────────────────────────────────────────────────────
[ingestionWorker, signalWorker, alertWorker].forEach((worker) => {
  worker.on('failed', (job, err) => {
    logger.error('Job failed', { queue: worker.name, jobId: job?.id, error: err.message });
  });
  worker.on('completed', (job) => {
    logger.debug('Job completed', { queue: worker.name, jobId: job.id });
  });
});

// ─── Scheduled jobs via cron ──────────────────────────────────────────────────
export async function initializeWorkers(): Promise<void> {
  // Run ingestion for all active watchlisted tickers every 30 minutes
  cron.schedule('*/30 * * * *', async () => {
    logger.info('Starting scheduled ingestion run');
    const tickers = await prisma.company.findMany({
      where: { isActive: true },
      select: { ticker: true },
      take: 200,
    });

    for (const { ticker } of tickers) {
      await ingestionQueue.add('reddit', { ticker, type: 'reddit' }, { priority: 5 });
      await ingestionQueue.add('news', { ticker, type: 'news' }, { priority: 5 });
    }
  });

  // Run signal detection every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    const tickers = await prisma.company.findMany({
      where: { isActive: true },
      select: { ticker: true },
      take: 200,
    });
    for (const { ticker } of tickers) {
      await signalQueue.add('detect', { ticker }, { priority: 3 });
    }
  });

  logger.info('Workers and cron jobs initialized');
}
