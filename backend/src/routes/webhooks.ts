import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

export const webhookRouter = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

function getTierFromPriceId(priceId: string): 'PRO' | 'ELITE' | 'FREE' {
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return 'PRO';
  if (priceId === process.env.STRIPE_ELITE_PRICE_ID) return 'ELITE';
  return 'FREE';
}

webhookRouter.post(
  '/stripe',
  async (req: Request, res: Response) => {
    const sig = req.headers['stripe-signature'] as string;

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err: any) {
      logger.error('Stripe webhook signature failed', { error: err.message });
      return res.status(400).json({ error: 'Webhook signature invalid' });
    }

    try {
      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session;
          if (session.mode !== 'subscription') break;

          const subscription = await stripe.subscriptions.retrieve(
            session.subscription as string,
            { expand: ['items.data.price'] }
          );

          const priceId = (subscription.items.data[0].price as Stripe.Price).id;
          const tier = getTierFromPriceId(priceId);
          const userId = subscription.metadata.userId;

          await prisma.user.update({
            where: { id: userId },
            data: {
              tier,
              stripeSubId: subscription.id,
              subStatus: 'ACTIVE',
              subPeriodEnd: new Date(subscription.current_period_end * 1000),
            },
          });

          logger.info('Subscription activated', { userId, tier });
          break;
        }

        case 'customer.subscription.updated': {
          const sub = event.data.object as Stripe.Subscription;
          const customerId = sub.customer as string;
          const priceId = (sub.items.data[0].price as Stripe.Price).id;
          const tier = getTierFromPriceId(priceId);

          await prisma.user.updateMany({
            where: { stripeCustomerId: customerId },
            data: {
              tier,
              subStatus: sub.status === 'active' ? 'ACTIVE' : 'PAST_DUE',
              subPeriodEnd: new Date(sub.current_period_end * 1000),
            },
          });

          logger.info('Subscription updated', { customerId, tier, status: sub.status });
          break;
        }

        case 'customer.subscription.deleted': {
          const sub = event.data.object as Stripe.Subscription;
          const customerId = sub.customer as string;

          await prisma.user.updateMany({
            where: { stripeCustomerId: customerId },
            data: { tier: 'FREE', subStatus: 'CANCELED', stripeSubId: null },
          });

          logger.info('Subscription canceled', { customerId });
          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice;
          const customerId = invoice.customer as string;

          await prisma.user.updateMany({
            where: { stripeCustomerId: customerId },
            data: { subStatus: 'PAST_DUE' },
          });
          break;
        }

        default:
          logger.debug('Unhandled Stripe event', { type: event.type });
      }

      res.json({ received: true });
    } catch (err) {
      logger.error('Webhook processing error', { error: err, eventType: event.type });
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }
);
