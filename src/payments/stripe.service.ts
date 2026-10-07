import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, PaymentMethod, PaymentStatus } from '@prisma/client';
import StripeLib from 'stripe';
import { PrismaService } from '../prisma/prisma.service';
import { CrmService } from '../crm/crm.service';
import { InventoryService } from '../inventory/inventory.service';
import { PlatformSecretsService } from '../platform-secrets/platform-secrets.service';

function createStripeClient(secretKey: string) {
  return new StripeLib(secretKey);
}

type StripeClient = ReturnType<typeof createStripeClient>;

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);

  /* Global fallback client (from env/DB) — used when no store context is available. */
  private readonly globalStripe: StripeClient | null;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly crmService: CrmService,
    private readonly inventoryService: InventoryService,
    private readonly platformSecrets: PlatformSecretsService,
  ) {
    const secretKey = this.resolveGlobalSecretKey();
    this.globalStripe = secretKey ? createStripeClient(secretKey) : null;
  }

  private resolveGlobalSecretKey(): string | undefined {
    return this.platformSecrets.getPlain('STRIPE_SECRET_KEY');
  }

  private resolveGlobalWebhookSecret(): string | undefined {
    return this.platformSecrets.getPlain('STRIPE_WEBHOOK_SECRET');
  }

  /** True if a global Stripe key is present (DB override or env). Health checks. */
  isConfigured(): boolean {
    return Boolean(this.resolveGlobalSecretKey());
  }

  /**
   * After Stripe.js confirms a card, poll/confirm without waiting on webhooks.
   * Uses the store secret key to retrieve the PaymentIntent.
   */
  async confirmOnlineOrderPayment(orderId: string): Promise<{
    paymentStatus: PaymentStatus;
  }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        paymentStatus: true,
        stripePaymentIntentId: true,
        location: { select: { brandId: true } },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found.');
    }

    if (order.paymentStatus === PaymentStatus.PAID) {
      return { paymentStatus: PaymentStatus.PAID };
    }

    if (!order.stripePaymentIntentId) {
      throw new BadRequestException('Order has no Stripe payment to confirm.');
    }

    const storeId = order.location.brandId;
    const stripe = await this.getStripeClientForStore(storeId);
    const paymentIntent = await stripe.paymentIntents.retrieve(
      order.stripePaymentIntentId,
    );

    if (
      paymentIntent.status === 'succeeded' ||
      paymentIntent.status === 'processing'
    ) {
      await this.markOrderPaidFromIntent({
        id: paymentIntent.id,
        metadata: {
          orderId:
            paymentIntent.metadata?.orderId?.trim() || orderId,
        },
        latest_charge: paymentIntent.latest_charge,
      });
      return { paymentStatus: PaymentStatus.PAID };
    }

    if (
      paymentIntent.status === 'canceled' ||
      paymentIntent.status === 'requires_payment_method'
    ) {
      await this.markOrderFailedFromIntent({
        metadata: { orderId },
      });
      return { paymentStatus: PaymentStatus.FAILED };
    }

    return { paymentStatus: order.paymentStatus };
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
      || this.resolveGlobalSecretKey();

    if (!key) {
      throw new ServiceUnavailableException(
        'Stripe is not configured for this store. Add a Stripe secret key in Infrastructure.',
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
      || this.resolveGlobalWebhookSecret();

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

  /* ─────────────────────────────── online (website) payment ── */

  /**
   * Card-not-present PaymentIntent for storefront checkout.
   * Returns client_secret for Stripe.js Payment Element.
   */
  async createOnlinePaymentIntent(params: {
    orderId: string;
    amountCents: number;
    customerEmail?: string | null;
  }) {
    if (params.amountCents < 50) {
      throw new BadRequestException(
        'Payment amount must be at least $0.50 AUD.',
      );
    }

    const storeId = await this.resolveStoreIdForOrder(params.orderId);
    const stripe = await this.getStripeClientForStore(storeId);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: params.amountCents,
      currency: 'aud',
      automatic_payment_methods: { enabled: true },
      capture_method: 'automatic',
      metadata: { orderId: params.orderId, channel: 'WEB' },
      ...(params.customerEmail?.trim()
        ? { receipt_email: params.customerEmail.trim() }
        : {}),
    });

    await this.prisma.order.update({
      where: { id: params.orderId },
      data: {
        stripePaymentIntentId: paymentIntent.id,
        paymentStatus: PaymentStatus.REQUIRES_PAYMENT,
        paymentMethod: PaymentMethod.CARD_ONLINE,
      },
    });

    if (!paymentIntent.client_secret) {
      throw new ServiceUnavailableException(
        'Stripe did not return a client secret for this payment.',
      );
    }

    return paymentIntent;
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
  /**
   * Verify webhook signature. Tries global whsec first, then each store's
   * saved webhook secret (Admin → Stripe Online), so per-store-only setups work.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructWebhookEvent(payload: Buffer, signature: string): any {
    const secrets: string[] = [];
    const globalSecret = this.resolveGlobalWebhookSecret()?.trim();
    if (globalSecret) {
      secrets.push(globalSecret);
    }

    /* Sync path can't await DB — use a cached list filled lazily below via
       throw-and-retry from the async controller wrapper. Keep sync verify for
       global; async helper used by controller when global is absent. */
    if (secrets.length === 0) {
      throw new ServiceUnavailableException(
        'Stripe webhook secret is not set. Add whsec_… in Admin → Stripe Online, or set STRIPE_WEBHOOK_SECRET.',
      );
    }

    const stripe = this.globalStripe ?? createStripeClient('sk_unused_verify_only');
    let lastError: unknown;
    for (const secret of secrets) {
      try {
        return stripe.webhooks.constructEvent(payload, signature, secret);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new BadRequestException('Invalid Stripe webhook signature.');
  }

  /**
   * Async verify that also tries every store webhook secret from the DB.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async constructWebhookEventAsync(
    payload: Buffer,
    signature: string,
  ): Promise<any> {
    const secrets = new Set<string>();
    const globalSecret = this.resolveGlobalWebhookSecret()?.trim();
    if (globalSecret) {
      secrets.add(globalSecret);
    }

    const rows = await this.prisma.storePaymentSettings.findMany({
      where: { stripeWebhookSecretRef: { not: null } },
      select: { stripeWebhookSecretRef: true },
    });
    for (const row of rows) {
      const s = row.stripeWebhookSecretRef?.trim();
      if (s) {
        secrets.add(s);
      }
    }

    if (secrets.size === 0) {
      throw new ServiceUnavailableException(
        'Stripe webhook secret is not set. Add whsec_… in Admin → Stripe Online, or set STRIPE_WEBHOOK_SECRET.',
      );
    }

    /* Any Stripe instance can verify signatures; key is unused for constructEvent. */
    const stripe =
      this.globalStripe ??
      createStripeClient(
        (
          await this.prisma.storePaymentSettings.findFirst({
            where: { stripeSecretKeyRef: { not: null } },
            select: { stripeSecretKeyRef: true },
          })
        )?.stripeSecretKeyRef?.trim() || 'sk_unused',
      );

    let lastError: unknown;
    for (const secret of secrets) {
      try {
        return stripe.webhooks.constructEvent(payload, signature, secret);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new BadRequestException('Invalid Stripe webhook signature.');
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

    /* WEB online orders become CONFIRMED so they appear on POS kitchen "New". */
    const nextStatus =
      order.status === OrderStatus.PENDING ||
      order.status === OrderStatus.CONFIRMED
        ? OrderStatus.CONFIRMED
        : undefined;

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
        ...(nextStatus ? { status: nextStatus } : {}),
        ...(order.paymentMethod
          ? {}
          : { paymentMethod: PaymentMethod.CARD_ONLINE }),
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
