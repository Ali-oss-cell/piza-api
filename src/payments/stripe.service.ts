import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import StripeLib from 'stripe';
import { PrismaService } from '../prisma/prisma.service';

function createStripeClient(secretKey: string) {
  return new StripeLib(secretKey);
}

type StripeClient = ReturnType<typeof createStripeClient>;

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private readonly stripe: StripeClient | null;
  private readonly webhookSecret: string | undefined;
  private readonly defaultReaderId: string | undefined;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');

    this.stripe = secretKey ? createStripeClient(secretKey) : null;
    this.webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
    this.defaultReaderId = this.configService.get<string>(
      'STRIPE_TERMINAL_READER_ID',
    );
  }

  isConfigured(): boolean {
    return this.stripe !== null;
  }

  private requireStripe(): StripeClient {
    if (!this.stripe) {
      throw new ServiceUnavailableException('Stripe is not configured');
    }

    return this.stripe;
  }

  async createTerminalPaymentIntent(orderId: string, amountCents: number) {
    const stripe = this.requireStripe();

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'aud',
      payment_method_types: ['card_present'],
      capture_method: 'automatic',
      metadata: { orderId },
    });

    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        stripePaymentIntentId: paymentIntent.id,
        paymentStatus: PaymentStatus.REQUIRES_PAYMENT,
        paymentMethod: PaymentMethod.CARD_TERMINAL,
      },
    });

    return paymentIntent;
  }

  async processTerminalPayment(paymentIntentId: string, readerId?: string) {
    const stripe = this.requireStripe();
    const resolvedReaderId = readerId ?? this.defaultReaderId;

    if (!resolvedReaderId) {
      throw new BadRequestException('Terminal reader ID is required');
    }

    await this.prisma.order.updateMany({
      where: { stripePaymentIntentId: paymentIntentId },
      data: { paymentStatus: PaymentStatus.PROCESSING },
    });

    return stripe.terminal.readers.processPaymentIntent(resolvedReaderId, {
      payment_intent: paymentIntentId,
    });
  }

  constructWebhookEvent(payload: Buffer, signature: string) {
    const stripe = this.requireStripe();

    if (!this.webhookSecret) {
      throw new ServiceUnavailableException('Stripe webhook secret is not set');
    }

    return stripe.webhooks.constructEvent(
      payload,
      signature,
      this.webhookSecret,
    );
  }

  async handleWebhookEvent(event: { type: string; data: { object: unknown } }) {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await this.markOrderPaidFromIntent(
          event.data.object as {
            id: string;
            metadata: { orderId?: string };
            latest_charge?: string | { id: string } | null;
          },
        );
        break;
      case 'payment_intent.payment_failed':
        await this.markOrderFailedFromIntent(
          event.data.object as { metadata: { orderId?: string } },
        );
        break;
      case 'charge.refunded':
        await this.markOrderRefundedFromCharge(
          event.data.object as {
            payment_intent?: string | { id: string } | null;
          },
        );
        break;
      default:
        this.logger.debug(`Unhandled Stripe event: ${event.type}`);
    }
  }

  private async markOrderPaidFromIntent(paymentIntent: {
    id: string;
    metadata: { orderId?: string };
    latest_charge?: string | { id: string } | null;
  }): Promise<void> {
    const orderId = paymentIntent.metadata.orderId;

    if (!orderId) {
      return;
    }

    const order = await this.prisma.order.findUnique({ where: { id: orderId } });

    if (!order || order.paymentStatus === PaymentStatus.PAID) {
      return;
    }

    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: PaymentStatus.PAID,
        paidAt: new Date(),
        stripePaymentIntentId: paymentIntent.id,
        stripeChargeId:
          typeof paymentIntent.latest_charge === 'string'
            ? paymentIntent.latest_charge
            : paymentIntent.latest_charge?.id,
      },
    });
  }

  private async markOrderFailedFromIntent(paymentIntent: {
    metadata: { orderId?: string };
  }): Promise<void> {
    const orderId = paymentIntent.metadata.orderId;

    if (!orderId) {
      return;
    }

    await this.prisma.order.updateMany({
      where: {
        id: orderId,
        paymentStatus: { not: PaymentStatus.PAID },
      },
      data: { paymentStatus: PaymentStatus.FAILED },
    });
  }

  private async markOrderRefundedFromCharge(charge: {
    payment_intent?: string | { id: string } | null;
  }): Promise<void> {
    const paymentIntentId =
      typeof charge.payment_intent === 'string'
        ? charge.payment_intent
        : charge.payment_intent?.id;

    if (!paymentIntentId) {
      return;
    }

    await this.prisma.order.updateMany({
      where: { stripePaymentIntentId: paymentIntentId },
      data: { paymentStatus: PaymentStatus.REFUNDED },
    });
  }
}
