import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import asyncHandler from 'express-async-handler';
import { prisma } from '../lib/prisma';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/jwt';
import { authenticate } from '../middleware/auth';
import { AppError, AuthError, ValidationError } from '../middleware/errorHandler';
import { logger } from '../lib/logger';
import { cacheGet, cacheSet, cacheDel } from '../lib/redis';

export const authRouter = Router();

// ─── Validation schemas ───────────────────────────────────────────────────────

const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain uppercase letter')
    .regex(/[0-9]/, 'Must contain number'),
  name: z.string().min(2).max(100).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, 'Password required'),
});

// ─── POST /api/auth/signup ────────────────────────────────────────────────────

authRouter.post(
  '/signup',
  asyncHandler(async (req: Request, res: Response) => {
    const body = signupSchema.parse(req.body);

    const existing = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
    });

    if (existing) {
      throw new AppError('Email already registered', 409, 'EMAIL_EXISTS');
    }

    const passwordHash = await bcrypt.hash(body.password, 12);

    const user = await prisma.user.create({
      data: {
        email: body.email.toLowerCase(),
        name: body.name,
        passwordHash,
        tier: 'FREE',
      },
      select: { id: true, email: true, name: true, tier: true, role: true },
    });

    const session = await prisma.session.create({
      data: {
        userId: user.id,
        token: signRefreshToken(user.id, ''),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      tier: user.tier,
      sessionId: session.id,
    });

    const refreshToken = signRefreshToken(user.id, session.id);

    await prisma.session.update({
      where: { id: session.id },
      data: { token: refreshToken },
    });

    logger.info('User registered', { userId: user.id, email: user.email });

    res.status(201).json({
      user: { id: user.id, email: user.email, name: user.name, tier: user.tier },
      accessToken,
      refreshToken,
    });
  })
);

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

authRouter.post(
  '/login',
  asyncHandler(async (req: Request, res: Response) => {
    const body = loginSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { email: body.email.toLowerCase() },
    });

    if (!user || !user.passwordHash) {
      throw new AuthError('Invalid credentials');
    }

    const valid = await bcrypt.compare(body.password, user.passwordHash);
    if (!valid) {
      throw new AuthError('Invalid credentials');
    }

    // Clean up old sessions (keep last 5)
    const sessions = await prisma.session.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    if (sessions.length >= 5) {
      const toDelete = sessions.slice(4).map((s) => s.id);
      await prisma.session.deleteMany({ where: { id: { in: toDelete } } });
    }

    const session = await prisma.session.create({
      data: {
        userId: user.id,
        token: 'placeholder',
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
    });

    const accessToken = signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      tier: user.tier,
      sessionId: session.id,
    });

    const refreshToken = signRefreshToken(user.id, session.id);

    await prisma.session.update({
      where: { id: session.id },
      data: { token: refreshToken },
    });

    logger.info('User logged in', { userId: user.id });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        tier: user.tier,
        role: user.role,
        avatarUrl: user.avatarUrl,
      },
      accessToken,
      refreshToken,
    });
  })
);

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────

authRouter.post(
  '/refresh',
  asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body;
    if (!refreshToken) throw new AuthError('Refresh token required');

    let payload: { sub: string; sessionId: string };
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new AuthError('Invalid refresh token');
    }

    const session = await prisma.session.findFirst({
      where: {
        id: payload.sessionId,
        userId: payload.sub,
        token: refreshToken,
        expiresAt: { gt: new Date() },
      },
      include: {
        user: {
          select: { id: true, email: true, role: true, tier: true },
        },
      },
    });

    if (!session) throw new AuthError('Session not found or expired');

    const newAccessToken = signAccessToken({
      sub: session.user.id,
      email: session.user.email,
      role: session.user.role,
      tier: session.user.tier,
      sessionId: session.id,
    });

    res.json({ accessToken: newAccessToken });
  })
);

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

authRouter.post(
  '/logout',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    if (req.user?.sessionId) {
      await prisma.session.deleteMany({
        where: { id: req.user.sessionId, userId: req.userId },
      });
    }
    res.json({ message: 'Logged out successfully' });
  })
);

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────

authRouter.get(
  '/me',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: {
        id: true,
        email: true,
        name: true,
        tier: true,
        role: true,
        avatarUrl: true,
        subStatus: true,
        subPeriodEnd: true,
        createdAt: true,
        _count: { select: { watchlist: true, alerts: true } },
      },
    });

    if (!user) throw new AuthError();
    res.json({ user });
  })
);
