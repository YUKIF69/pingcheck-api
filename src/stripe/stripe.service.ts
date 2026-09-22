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

  // Обробляє webhook від Stripe — викликається коли оплата успішна
  async handleWebhook(payload: Buffer, signature: string) {
    const webhookSecret = this.config.getOrThrow('STRIPE_WEBHOOK_SECRET');

    // Верифікуємо підпис — захист від фейкових запитів
    const event = this.stripe.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret,
    );

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;

      if (userId) {
        // Оновлюємо підписку юзера в БД
        await this.prisma.subscription.upsert({
          where: { userId },
          create: {
            userId,
            stripeCustomerId: session.customer as string,
            stripeSubId: session.subscription as string,
            plan: 'premium',
            status: 'active',
          },
          update: {
            stripeCustomerId: session.customer as string,
            stripeSubId: session.subscription as string,
            plan: 'premium',
            status: 'active',
          },
        });
      }
    }
  }
}
