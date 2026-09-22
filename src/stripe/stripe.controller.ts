import {
  Controller,
  Post,
  Headers,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { StripeService } from './stripe.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GetUser } from '../auth/get-user.decorator';

@ApiTags('stripe')
@Controller('stripe')
export class StripeController {
  constructor(private stripe: StripeService) {}

  // Захищений endpoint — тільки авторизований юзер може створити checkout сесію
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('checkout')
  createCheckout(
    @GetUser('id') userId: string,
    @GetUser('email') userEmail: string,
  ) {
    return this.stripe.createCheckoutSession(userId, userEmail);
  }

  // Публічний endpoint — Stripe надсилає сюди підтвердження оплати
  // raw: true важливо — Stripe вимагає raw body для верифікації підпису
  @Post('webhook')
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    await this.stripe.handleWebhook(req.rawBody!, signature);
    return { received: true };
  }
}
