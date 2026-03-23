import rateLimit from 'express-rate-limit';
import { redis } from '../lib/redis';
import { logger } from '../lib/logger';

// Standard API rate limit
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.headers['x-forwarded-for'] as string || req.ip || 'unknown',
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', { ip: req.ip, path: req.path });
    res.status(429).json({
      error: 'Too many requests, please try again later',
      code: 'RATE_LIMIT',
      retryAfter: Math.ceil(15 * 60),
    });
  },
});

// Strict limiter for auth endpoints
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.headers['x-forwarded-for'] as string || req.ip || 'unknown',
  handler: (req, res) => {
    logger.warn('Auth rate limit exceeded', { ip: req.ip });
    res.status(429).json({
      error: 'Too many authentication attempts',
      code: 'AUTH_RATE_LIMIT',
      retryAfter: Math.ceil(15 * 60),
    });
  },
});

// Per-user Redis-backed rate limiter for premium features
export async function checkUserRateLimit(
  userId: string,
  action: string,
  limit: number,
  windowSec: number
): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  const key = `ratelimit:${action}:${userId}`;
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - windowSec;

  const pipeline = redis.pipeline();
  pipeline.zremrangebyscore(key, 0, windowStart);
  pipeline.zadd(key, now, `${now}-${Math.random()}`);
  pipeline.zcard(key);
  pipeline.expire(key, windowSec);

  const results = await pipeline.exec();
  const count = (results?.[2]?.[1] as number) || 0;
  const allowed = count <= limit;
  const remaining = Math.max(0, limit - count);

  return {
    allowed,
    remaining,
    resetIn: windowSec,
  };
}
