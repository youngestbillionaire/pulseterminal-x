import { Request, Response, NextFunction } from 'express';
import { UserRole, UserTier } from '@prisma/client';
import { verifyAccessToken, JwtPayload } from '../lib/jwt';
import { prisma } from '../lib/prisma';
import { AuthError, ForbiddenError } from './errorHandler';
import { logger } from '../lib/logger';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      userId?: string;
    }
  }
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  try {
    const header = req.headers.authorization;
    const apiKey = req.headers['x-api-key'] as string;

    if (apiKey) {
      // API key auth handled separately — delegate to apiKeyAuth middleware
      return next();
    }

    if (!header?.startsWith('Bearer ')) {
      throw new AuthError('No token provided');
    }

    const token = header.slice(7);
    const payload = verifyAccessToken(token);

    req.user = payload;
    req.userId = payload.sub;
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      next(new AuthError('Token expired'));
    } else if (err.name === 'JsonWebTokenError') {
      next(new AuthError('Invalid token'));
    } else {
      next(err);
    }
  }
}

export function requireTier(...tiers: UserTier[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AuthError());
    }

    const tierOrder: Record<UserTier, number> = {
      FREE: 0,
      PRO: 1,
      ELITE: 2,
    };

    const userTierLevel = tierOrder[req.user.tier];
    const requiredLevel = Math.min(...tiers.map((t) => tierOrder[t]));

    if (userTierLevel < requiredLevel) {
      return next(
        new ForbiddenError(
          `This feature requires ${tiers.join(' or ')} tier. Upgrade your plan to access it.`
        )
      );
    }

    next();
  };
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new AuthError());
    if (!roles.includes(req.user.role)) return next(new ForbiddenError());
    next();
  };
}

export async function apiKeyAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const apiKey = req.headers['x-api-key'] as string;
  if (!apiKey) return next(new AuthError('API key required'));

  try {
    const user = await prisma.user.findUnique({
      where: { apiKey },
      select: { id: true, email: true, role: true, tier: true, apiCallsToday: true, apiCallsReset: true },
    });

    if (!user) return next(new AuthError('Invalid API key'));

    // Check daily API limit based on tier
    const limits: Record<UserTier, number> = { FREE: 100, PRO: 1000, ELITE: 10000 };
    const limit = limits[user.tier];

    const now = new Date();
    const resetTime = new Date(user.apiCallsReset);
    const shouldReset = now.getTime() - resetTime.getTime() > 86400000; // 24h

    if (shouldReset) {
      await prisma.user.update({
        where: { id: user.id },
        data: { apiCallsToday: 1, apiCallsReset: now },
      });
    } else if (user.apiCallsToday >= limit) {
      return next(
        new ForbiddenError(`API rate limit reached (${limit}/day for ${user.tier} tier)`)
      );
    } else {
      await prisma.user.update({
        where: { id: user.id },
        data: { apiCallsToday: { increment: 1 } },
      });
    }

    req.user = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tier: user.tier,
      sessionId: 'api-key',
    };
    req.userId = user.id;
    next();
  } catch (err) {
    logger.error('API key auth error', { error: err });
    next(new AuthError());
  }
}
