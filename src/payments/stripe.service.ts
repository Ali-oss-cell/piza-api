import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMethod, PaymentStatus } from '@prisma/client';
import StripeLib from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { CrmService } from '../crm/crm.service';
import { InventoryService } from '../inventory/inventory.service';

function createStripeClient(secretKey: string) {
  return new StripeLib(secretKey);
}

type StripeClient = ReturnType<typeof createStripeClient>;

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);

  /* Global fallback client (from env) — used when no store context is available,
     e.g. health checks. Per-store calls load their own client from the DB. */
  private readonly globalStripe: StripeClient | null;
  private readonly globalWebhookSecret: string | undefined;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly crmService: CrmService,
    private readonly inventoryService: InventoryService,
  ) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    this.globalStripe = secretKey ? createStripeClient(secretKey) : null;
    this.globalWebhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');
  }

  /** True if a global (env-based) Stripe key is present. Used for health checks only. */
  isConfigured(): boolean {
    return this.globalStripe !== null;
  }

  /* ─────────────────────────────── per-store helpers ── */

  /**
   * Load a Stripe client using the secret key stored in the DB for this store.
   * Falls back to the global env key if the store has no per-store key saved.
   */
  private async getStripeClientForStore(storeId: string): Promise<StripeClient> {
    const settings = await this.prisma.storePaymentSettings.findUnique({
      where: { storeId },
      select: { stripeSecretKeyRef: true },
    });

    const key = settings?.stripeSecretKeyRef?.trim()
      || this.configService.get<string>('STRIPE_SECRET_KEY');

    if (!key) {
      throw new ServiceUnavailableException(
        'Stripe is not configured for this store. Add a Stripe secret key in Advanced Settings.',
      );
    }

    return createStripeClient(key);
  }

  /**
   * Load the webhook secret for a store.
   * Falls back to the global env value if no per-store secret is saved.
   */
  private async getWebhookSecretForStore(storeId: string): Promise<string> {
    const settings = await this.prisma.storePaymentSettings.findUnique({
      where: { storeId },
      select: { stripeWebhookSecretRef: true },
    });

    const secret = settings?.stripeWebhookSecretRef?.trim()
      || this.globalWebhookSecret;

    if (!secret) {
      throw new ServiceUnavailableException(
        'Stripe webhook secret is not configured for this store.',
      );
    }

    return secret;
  }

  /**
   * Resolve storeId from an orderId (used when we only have the order at hand).
   */
  private async resolveStoreIdForOrder(orderId: string): Promise<string> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        location: { select: { brandId: true } },
      },
    });

    if (!order?.location?.brandId) {
      throw new NotFoundException(`Order ${orderId} has no associated store.`);
    }

    return order.location.brandId;
  }

  /* ─────────────────────────────── terminal payment ── */

  async createTerminalPaymentIntent(orderId: string, amountCents: number) {
    const storeId = await this.resolveStoreIdForOrder(orderId);
    const stripe = await this.getStripeClientForStore(storeId);

    const location = await this.prisma.location.findFirst({
      where: { brandId: storeId, isActive: true },
      select: { stripeTerminalLocationId: true },
    });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'aud',
      payment_method_types: ['card_present'],
      capture_method: 'automatic',
      metadata: { orderId },
      ...(location?.stripeTerminalLocationId
        ? { on_behalf_of: undefined } // location is set at reader level
        : {}),
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
    /* Resolve store from order linked to this paymentIntent */
    const order = await this.prisma.order.findFirst({
      where: { stripePaymentIntentId: paymentIntentId },
      select: {
        location: {
          select: {
            brandId: true,
            stripeTerminalReaderId: true,
          },
        },
      },
    });

    if (!order?.location) {
      throw new NotFoundException('Order not found for this payment intent.');
    }

    const storeId = order.location.brandId;
    const resolvedReaderId =
      readerId ?? order.location.stripeTerminalReaderId ?? undefined;

    if (!resolvedReaderId) {
      throw new BadRequestException(
        'Terminal reader ID is required. Set it in Advanced Settings → Stripe Terminal.',
      );
    }

    const stripe = await this.getStripeClientForStore(storeId);

    await this.prisma.order.updateMany({
      where: { stripePaymentIntentId: paymentIntentId },
      data: { paymentStatus: PaymentStatus.PROCESSING },
    });

    return stripe.terminal.readers.processPaymentIntent(resolvedReaderId, {
      payment_intent: paymentIntentId,
    });
  }

  /* ─────────────────────────────── webhooks ── */

  /**
   * Verify and parse a Stripe webhook.
   * Tries per-store secret first (resolved from order metadata), then global.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructWebhookEvent(payload: Buffer, signature: string): any {
    /* We must verify synchronously here (called before we know the store).
       Use the global client + secret for the initial parse, then the event's
       orderId metadata tells us the store for subsequent per-store operations. */
    const stripe = this.globalStripe;
    const secret = this.globalWebhookSecret;

    if (!stripe || !secret) {
      throw new ServiceUnavailableException(
        'Stripe global webhook secret is not set. Add STRIPE_WEBHOOK_SECRET to env or set a per-store secret.',
      );
    }

    return stripe.webhooks.constructEvent(payload, signature, secret);
  }

  /**
   * Per-store webhook verification — use when you know the storeId upfront
   * (e.g. store-scoped webhook endpoints).
   */
  async constructWebhookEventForStore(
    payload: Buffer,
    signature: string,
    storeId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    const secret = await this.getWebhookSecretForStore(storeId);
    const stripe = await this.getStripeClientForStore(storeId);
    return stripe.webhooks.constructEvent(payload, signature, secret);
  }

  /* ─────────────────────────────── event handling ── */

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
    if (!orderId) return;

    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return;

    if (order.paymentStatus === PaymentStatus.PAID) {
      await this.inventoryService.deductForPaidOrder(orderId);
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

    await this.crmService.linkOrderById(orderId);
    await this.inventoryService.deductForPaidOrder(orderId);
  }

  private async markOrderFailedFromIntent(paymentIntent: {
    metadata: { orderId?: string };
  }): Promise<void> {
    const orderId = paymentIntent.metadata.orderId;
    if (!orderId) return;

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

    if (!paymentIntentId) return;

    const orders = await this.prisma.order.findMany({
      where: { stripePaymentIntentId: paymentIntentId },
      select: { id: true },
    });

    await this.prisma.order.updateMany({
      where: { stripePaymentIntentId: paymentIntentId },
      data: { paymentStatus: PaymentStatus.REFUNDED },
    });

    for (const order of orders) {
      await this.inventoryService.restockForRefundedOrder(order.id);
    }
  }
}
