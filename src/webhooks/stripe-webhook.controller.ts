import {
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { StripeService } from '../payments/stripe.service';

@Controller('webhooks')
export class StripeWebhookController {
  constructor(private readonly stripeService: StripeService) {}

  @Post('stripe')
  @HttpCode(200)
  async handleStripeWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature?: string,
  ): Promise<{ received: true }> {
    if (!signature) {
      throw new ServiceUnavailableException('Missing Stripe signature');
    }

    const rawBody = request.rawBody;

    if (!rawBody) {
      throw new ServiceUnavailableException('Missing raw request body');
    }

    const event = await this.stripeService.constructWebhookEventAsync(
      rawBody,
      signature,
    );
    await this.stripeService.handleWebhookEvent(event);

    return { received: true };
  }
}
