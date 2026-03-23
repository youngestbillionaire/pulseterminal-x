import { Router, Request, Response } from 'express';
import asyncHandler from 'express-async-handler';
import Stripe from 'stripe';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../lib/logger';

export const subscriptionRouter = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

const PLANS = {
  PRO: process.env.STRIPE_PRO_PRICE_ID!,
  ELITE: process.env.STRIPE_ELITE_PRICE_ID!,
};

// ─── POST /api/subscription/checkout ─────────────────────────────────────────
subscriptionRouter.post(
  '/checkout',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { plan } = req.body as { plan: 'PRO' | 'ELITE' };
    if (!PLANS[plan]) throw new AppError('Invalid plan', 400);

    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user) throw new AppError('User not found', 404);

    // Get or create Stripe customer
    let customerId = user.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name || undefined,
        metadata: { userId: user.id },
      });
      customerId = customer.id;
      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: PLANS[plan], quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL}/dashboard?upgrade=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/pricing?upgrade=canceled`,
      subscription_data: {
        metadata: { userId: user.id, plan },
      },
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
    });

    res.json({ url: session.url });
  })
);

// ─── POST /api/subscription/portal ───────────────────────────────────────────
subscriptionRouter.post(
  '/portal',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const user = await prisma.user.findUnique({ where: { id: req.userId! } });
    if (!user?.stripeCustomerId) throw new AppError('No active subscription', 400);

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL}/dashboard/settings`,
    });

    res.json({ url: session.url });
  })
);

// ─── GET /api/subscription/status ────────────────────────────────────────────
subscriptionRouter.get(
  '/status',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      select: { tier: true, subStatus: true, subPeriodEnd: true },
    });
    res.json({ subscription: user });
  })
);
