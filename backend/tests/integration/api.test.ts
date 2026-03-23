/**
 * Integration tests — use a real (test) DB or comprehensive mocks.
 * These tests verify the full request → middleware → route → response chain.
 */
import request from 'supertest';
import { app } from '../../src/app';
import { signAccessToken } from '../../src/lib/jwt';

// Full mock of Prisma for integration layer
jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    company: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    earningsReport: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    sentimentLog: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    signal: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    newsItem: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    redditMention: {
      findMany: jest.fn(),
    },
    watchlistItem: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $transaction: jest.fn(),
    searchHistory: { create: jest.fn() },
    user: { findUnique: jest.fn() },
    session: { create: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  },
}));

jest.mock('../../src/lib/redis', () => ({
  redis: { ping: jest.fn().mockResolvedValue('PONG') },
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
  cacheDel: jest.fn().mockResolvedValue(undefined),
  cacheDelPattern: jest.fn().mockResolvedValue(undefined),
  CacheKeys: {
    company: (t: string) => `company:${t}`,
    earnings: (t: string) => `earnings:${t}`,
    sentiment: (t: string, s: string) => `sentiment:${t}:${s}`,
    signals: (t: string) => `signals:${t}`,
    trending: () => 'trending:tickers',
    earningsCalendar: (d: string) => `calendar:${d}`,
    userWatchlist: (id: string) => `watchlist:${id}`,
  },
}));

jest.mock('../../src/services/intelligenceClient', () => ({
  intelligenceClient: {
    generateEarningsInsight: jest.fn(),
    detectSignals: jest.fn(),
    ingestReddit: jest.fn(),
    ingestNews: jest.fn(),
    healthCheck: jest.fn().mockResolvedValue(true),
  },
}));

// Helper: generate a valid JWT for tests
function makeToken(tier = 'PRO', role = 'USER') {
  process.env.JWT_SECRET = 'test-jwt-secret-32-chars-minimum-ok';
  return signAccessToken({
    sub: 'user-test-id',
    email: 'test@example.com',
    role: role as any,
    tier: tier as any,
    sessionId: 'sess-1',
  });
}

const { prisma } = require('../../src/lib/prisma');

// ─── Company endpoints ────────────────────────────────────────────────────────
describe('GET /api/companies/:ticker', () => {
  const mockCompany = {
    id: 'company-1',
    ticker: 'AAPL',
    name: 'Apple Inc.',
    sector: 'Technology',
    exchange: 'NASDAQ',
    logoUrl: null,
    marketCap: 3e12,
    description: 'Apple Inc. designs consumer electronics.',
    isActive: true,
    earnings: [],
    sentimentLogs: [],
    signals: [],
    _count: { watchlist: 142 },
  };

  it('should return company data for valid ticker', async () => {
    prisma.company.findUnique.mockResolvedValue(mockCompany);

    const res = await request(app)
      .get('/api/companies/AAPL')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.company.ticker).toBe('AAPL');
    expect(res.body.company.name).toBe('Apple Inc.');
  });

  it('should return 404 for unknown ticker', async () => {
    prisma.company.findUnique.mockResolvedValue(null);

    const res = await request(app)
      .get('/api/companies/ZZZZZ')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('should return 401 without auth token', async () => {
    const res = await request(app).get('/api/companies/AAPL');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/companies/search', () => {
  it('should search companies', async () => {
    prisma.company.findMany.mockResolvedValue([
      { id: '1', ticker: 'AAPL', name: 'Apple Inc.', sector: 'Technology', exchange: 'NASDAQ', logoUrl: null, marketCap: 3e12 },
    ]);

    const res = await request(app)
      .get('/api/companies/search?q=apple')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].ticker).toBe('AAPL');
  });

  it('should reject search with no query', async () => {
    const res = await request(app)
      .get('/api/companies/search')
      .set('Authorization', `Bearer ${makeToken()}`);
    expect(res.status).toBe(400);
  });
});

// ─── Signals ──────────────────────────────────────────────────────────────────
describe('GET /api/signals', () => {
  it('should return paginated signals', async () => {
    const mockSignals = [
      {
        id: 'sig-1',
        ticker: 'NVDA',
        type: 'MENTION_SPIKE',
        severity: 'HIGH',
        title: 'NVDA mention spike: 4.2x normal',
        description: 'Elevated social activity',
        score: 78,
        isActive: true,
        detectedAt: new Date().toISOString(),
        company: { ticker: 'NVDA', name: 'NVIDIA', logoUrl: null, sector: 'Technology' },
      },
    ];

    prisma.$transaction.mockResolvedValue([mockSignals, 1]);

    const res = await request(app)
      .get('/api/signals?hours=24&limit=10')
      .set('Authorization', `Bearer ${makeToken()}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('signals');
    expect(res.body).toHaveProperty('total');
    expect(res.body.signals[0].type).toBe('MENTION_SPIKE');
  });
});

// ─── Watchlist ────────────────────────────────────────────────────────────────
describe('POST /api/watchlist', () => {
  it('should add ticker to watchlist', async () => {
    prisma.watchlistItem.count.mockResolvedValue(0);
    prisma.company.findUnique.mockResolvedValue({ id: 'c1', ticker: 'TSLA', name: 'Tesla' });
    prisma.watchlistItem.findFirst.mockResolvedValue(null);
    prisma.watchlistItem.create.mockResolvedValue({
      id: 'w1', ticker: 'TSLA', company: { ticker: 'TSLA', name: 'Tesla', logoUrl: null },
    });

    const res = await request(app)
      .post('/api/watchlist')
      .set('Authorization', `Bearer ${makeToken('PRO')}`
      )
      .send({ ticker: 'TSLA' });

    expect(res.status).toBe(201);
    expect(res.body.item.ticker).toBe('TSLA');
  });

  it('should reject FREE tier exceeding limit', async () => {
    prisma.watchlistItem.count.mockResolvedValue(5); // At FREE limit

    const res = await request(app)
      .post('/api/watchlist')
      .set('Authorization', `Bearer ${makeToken('FREE')}`
      )
      .send({ ticker: 'TSLA' });

    expect(res.status).toBe(403);
  });
});
