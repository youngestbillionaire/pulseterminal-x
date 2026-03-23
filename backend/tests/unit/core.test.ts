import { signAccessToken, verifyAccessToken, signRefreshToken, verifyRefreshToken } from '../../src/lib/jwt';

// ─── JWT Unit Tests ───────────────────────────────────────────────────────────
describe('JWT utilities', () => {
  const payload = {
    sub: 'user-123',
    email: 'test@example.com',
    role: 'USER' as const,
    tier: 'FREE' as const,
    sessionId: 'session-abc',
  };

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-jwt-secret-32-chars-minimum-ok';
    process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32-chars-min-ok';
  });

  it('should sign and verify access token', () => {
    const token = signAccessToken(payload);
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);

    const decoded = verifyAccessToken(token);
    expect(decoded.sub).toBe(payload.sub);
    expect(decoded.email).toBe(payload.email);
    expect(decoded.tier).toBe('FREE');
  });

  it('should sign and verify refresh token', () => {
    const token = signRefreshToken('user-123', 'session-abc');
    const decoded = verifyRefreshToken(token);
    expect(decoded.sub).toBe('user-123');
    expect(decoded.sessionId).toBe('session-abc');
  });

  it('should throw on invalid access token', () => {
    expect(() => verifyAccessToken('bad.token.here')).toThrow();
  });

  it('should throw on tampered token', () => {
    const token = signAccessToken(payload);
    const parts = token.split('.');
    parts[1] = Buffer.from(JSON.stringify({ sub: 'attacker', role: 'ADMIN' })).toString('base64');
    expect(() => verifyAccessToken(parts.join('.'))).toThrow();
  });
});

// ─── Error handler tests ──────────────────────────────────────────────────────
import request from 'supertest';
import { app } from '../../src/app';

jest.mock('../../src/lib/prisma', () => ({ prisma: {} }));
jest.mock('../../src/lib/redis', () => ({
  redis: {},
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn(),
  cacheDel: jest.fn(),
  CacheKeys: { company: (t: string) => `company:${t}`, trending: () => 'trending' },
}));

describe('Error handling', () => {
  it('should return 404 for unknown routes', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('should return JSON errors', async () => {
    const res = await request(app).get('/api/unknown-path');
    expect(res.headers['content-type']).toMatch(/json/);
  });
});

// ─── Health check tests ───────────────────────────────────────────────────────
describe('GET /api/health', () => {
  it('should return health status', async () => {
    // Mock DB and Redis for health check
    const { prisma } = require('../../src/lib/prisma');
    prisma.$queryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
    const { redis } = require('../../src/lib/redis');
    redis.ping = jest.fn().mockResolvedValue('PONG');

    const res = await request(app).get('/api/health');
    expect(res.status).toBeLessThanOrEqual(503);
    expect(res.body).toHaveProperty('timestamp');
  });

  it('GET /api/health/live should always return ok', async () => {
    const res = await request(app).get('/api/health/live');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

// ─── Rate limit key builder tests ─────────────────────────────────────────────
import { CacheKeys } from '../../src/lib/redis';

describe('CacheKeys', () => {
  it('should generate correct cache keys', () => {
    expect(CacheKeys.company('aapl')).toBe('company:AAPL');
    expect(CacheKeys.company('MSFT')).toBe('company:MSFT');
    expect(CacheKeys.sentiment('nvda', 'reddit')).toBe('sentiment:NVDA:reddit');
    expect(CacheKeys.userWatchlist('user-123')).toBe('watchlist:user-123');
  });
});
