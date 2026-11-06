/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class StripeService {
  private stripe: Stripe;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    // Ініціалізуємо Stripe клієнт з secret key
    this.stripe = new Stripe(
      this.config.getOrThrow<string>('STRIPE_SECRET_KEY'),
    );
  }

  // Створює Stripe Checkout сесію — юзер переходить на hosted Stripe сторінку і платить
  async createCheckoutSession(userId: string, userEmail: string) {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: userEmail,
      line_items: [
        {
          price: this.config.getOrThrow('STRIPE_PRICE_ID'),
          quantity: 1,
        },
      ],
      // Після оплати — редірект на dashboard
      success_url: `${this.config.getOrThrow('FRONTEND_URL')}/dashboard?upgraded=true`,
      cancel_url: `${this.config.getOrThrow('FRONTEND_URL')}/dashboard`,
      metadata: { userId }, // зберігаємо userId щоб знайти юзера у webhook
    });

    return { url: session.url };
  }

  async handleWebhook(payload: Buffer, signature: string) {
    const webhookSecret = this.config.getOrThrow<string>(
      'STRIPE_WEBHOOK_SECRET',
    );
    const event = this.stripe.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret,
    );

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        if (!userId) break;
        const data = {
          stripeCustomerId: session.customer as string,
          stripeSubId: session.subscription as string,
          plan: 'premium',
          status: 'active',
        };
        await this.prisma.subscription.upsert({
          where: { userId },
          create: { userId, ...data },
          update: data,
        });
        break;
      }
      // Підписку оновили або скасували: синхронізуємо план з БД
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.syncSubscription(event.data.object as Stripe.Subscription);
        break;
    }
  }

  // Premium лишається, поки підписка активна, на пробному періоді або Stripe ще повторює платіж (past_due)
  private async syncSubscription(sub: Stripe.Subscription) {
    const keepsPremium = ['active', 'trialing', 'past_due'].includes(
      sub.status,
    );
    await this.prisma.subscription.updateMany({
      where: { stripeSubId: sub.id },
      data: { plan: keepsPremium ? 'premium' : 'free', status: sub.status },
    });
  }
}
