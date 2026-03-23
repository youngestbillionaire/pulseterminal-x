import request from 'supertest';
import bcrypt from 'bcryptjs';
import { app } from '../../src/app';
import { prisma } from '../../src/lib/prisma';
import { redis } from '../../src/lib/redis';

// ─── Mock Prisma ──────────────────────────────────────────────────────────────
jest.mock('../../src/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    session: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    searchHistory: {
      create: jest.fn(),
    },
  },
}));

jest.mock('../../src/lib/redis', () => ({
  redis: { ping: jest.fn(), get: jest.fn(), set: jest.fn(), del: jest.fn(), setex: jest.fn() },
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
  cacheDel: jest.fn().mockResolvedValue(undefined),
  CacheKeys: { userWatchlist: (id: string) => `watchlist:${id}` },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('POST /api/auth/signup', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should create a new user and return tokens', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    (mockPrisma.user.create as jest.Mock).mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      name: 'Test User',
      tier: 'FREE',
      role: 'USER',
    });
    (mockPrisma.session.create as jest.Mock).mockResolvedValue({ id: 'session-1', token: 'placeholder' });
    (mockPrisma.session.update as jest.Mock).mockResolvedValue({});

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'test@example.com', password: 'Password1', name: 'Test User' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.user.email).toBe('test@example.com');
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('should return 400 for invalid email', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'not-an-email', password: 'Password1' });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('fields.email');
  });

  it('should return 400 for weak password', async () => {
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'test@example.com', password: 'weak' });
    expect(res.status).toBe(400);
  });

  it('should return 409 if email already exists', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'existing' });

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ email: 'existing@example.com', password: 'Password1' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('EMAIL_EXISTS');
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(() => jest.clearAllMocks());

  const mockUser = {
    id: 'user-1',
    email: 'user@example.com',
    passwordHash: bcrypt.hashSync('Password1', 10),
    role: 'USER',
    tier: 'FREE',
    name: 'Test',
    avatarUrl: null,
  };

  it('should login with valid credentials', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
    (mockPrisma.session.findMany as jest.Mock).mockResolvedValue([]);
    (mockPrisma.session.create as jest.Mock).mockResolvedValue({ id: 'session-1', token: 'x' });
    (mockPrisma.session.update as jest.Mock).mockResolvedValue({});

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'Password1' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body.user.email).toBe('user@example.com');
  });

  it('should return 401 for wrong password', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'WrongPass1' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('AUTH_ERROR');
  });

  it('should return 401 for unknown email', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'Password1' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('should return 401 without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('should return 401 with invalid token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
  });
});
