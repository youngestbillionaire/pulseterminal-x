import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { authRouter } from './routes/auth';
import { companyRouter } from './routes/company';
import { earningsRouter } from './routes/earnings';
import { sentimentRouter } from './routes/sentiment';
import { signalRouter } from './routes/signals';
import { alertRouter } from './routes/alerts';
import { watchlistRouter } from './routes/watchlist';
import { webhookRouter } from './routes/webhooks';
import { subscriptionRouter } from './routes/subscription';
import { healthRouter } from './routes/health';
import { apiLimiter, strictLimiter } from './middleware/rateLimiter';
import { logger } from './lib/logger';

export const app = express();

// ─── Security ────────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production',
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
}));

// ─── Stripe webhooks need raw body ───────────────────────────────────────────
app.use('/api/webhooks/stripe', express.raw({ type: 'application/json' }));

// ─── Body parsing ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(compression());

// ─── Logging ─────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', {
    stream: { write: (msg) => logger.http(msg.trim()) },
  }));
}
app.use(requestLogger);

// ─── Rate limiting ───────────────────────────────────────────────────────────
app.use('/api/', apiLimiter);
app.use('/api/auth/', strictLimiter);

// ─── Routes ──────────────────────────────────────────────────────────────────
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/companies', companyRouter);
app.use('/api/earnings', earningsRouter);
app.use('/api/sentiment', sentimentRouter);
app.use('/api/signals', signalRouter);
app.use('/api/alerts', alertRouter);
app.use('/api/watchlist', watchlistRouter);
app.use('/api/subscription', subscriptionRouter);
app.use('/api/webhooks', webhookRouter);

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.path });
});

// ─── Error handler ───────────────────────────────────────────────────────────
app.use(errorHandler);

export default app;
