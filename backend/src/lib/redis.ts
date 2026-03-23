import Redis from 'ioredis';
import { logger } from './logger';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  reconnectOnError(err) {
    logger.error('Redis error', { error: err.message });
    return true;
  },
  lazyConnect: false,
});

redis.on('connect', () => logger.info('Redis connected'));
redis.on('error', (err) => logger.error('Redis error', { error: err.message }));
redis.on('reconnecting', () => logger.warn('Redis reconnecting...'));

// ─── Cache helpers ────────────────────────────────────────────────────────────

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const val = await redis.get(key);
    if (!val) return null;
    return JSON.parse(val) as T;
  } catch {
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds = 300
): Promise<void> {
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  } catch (err) {
    logger.warn('Cache set failed', { key, error: err });
  }
}

export async function cacheDel(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch (err) {
    logger.warn('Cache del failed', { key, error: err });
  }
}

export async function cacheDelPattern(pattern: string): Promise<void> {
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (err) {
    logger.warn('Cache del pattern failed', { pattern, error: err });
  }
}

// Cache key builders
export const CacheKeys = {
  company: (ticker: string) => `company:${ticker.toUpperCase()}`,
  earnings: (ticker: string) => `earnings:${ticker.toUpperCase()}`,
  sentiment: (ticker: string, source: string) =>
    `sentiment:${ticker.toUpperCase()}:${source}`,
  signals: (ticker: string) => `signals:${ticker.toUpperCase()}`,
  trending: () => 'trending:tickers',
  earningsCalendar: (date: string) => `calendar:${date}`,
  userWatchlist: (userId: string) => `watchlist:${userId}`,
  apiRateLimit: (userId: string) => `ratelimit:api:${userId}`,
};
