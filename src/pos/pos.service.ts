import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DeliveryMode,
  FulfillmentType,
  Location,
  Order,
  OrderChannel,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CrmService } from '../crm/crm.service';
import { InventoryService } from '../inventory/inventory.service';
import { PaymentSettingsService } from '../payment-settings/payment-settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { LinklyService } from '../payments/linkly.service';
import { StripeService } from '../payments/stripe.service';
import { CreatePosOrderDto } from './dto/create-pos-order.dto';
import { QuoteRequestDto } from '../pricing/dto/quote-request.dto';

@Injectable()
export class PosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: PricingService,
    private readonly linklyService: LinklyService,
    private readonly stripeService: StripeService,
    private readonly paymentSettingsService: PaymentSettingsService,
    private readonly crmService: CrmService,
    private readonly inventoryService: InventoryService,
  ) {}

  quote(dto: QuoteRequestDto) {
    return this.pricingService.quote(dto.items);
  }

  getPaymentMethods(brandSlug?: string) {
    const slug = brandSlug?.trim().toLowerCase();
    if (!slug) {
      throw new BadRequestException(
        'Store (brand) is required. Select a store on this POS device.',
      );
    }
    return this.paymentSettingsService.getPosMethods(slug);
  }

  async createOrder(
    dto: CreatePosOrderDto,
    staff: AuthenticatedUser,
    brandSlug?: string,
    locationId?: string,
  ): Promise<Order> {
    if (dto.clientRequestId) {
      const existing = await this.prisma.order.findUnique({
        where: { clientRequestId: dto.clientRequestId },
        include: { items: true, staffUser: true },
      });

      if (existing) {
        return existing;
      }
    }

    const location = await this.resolvePosLocation(staff, brandSlug, locationId);
    const quote = await this.pricingService.quote(dto.items);
    const ticketNumber = await this.nextTicketNumber(location.id);

    const data: Prisma.OrderCreateInput = {
      location: { connect: { id: location.id } },
      channel: OrderChannel.POS,
      deliveryMode:
        dto.fulfillmentType === FulfillmentType.DELIVERY
          ? DeliveryMode.DELIVERY
          : DeliveryMode.PICKUP,
      fulfillmentType: dto.fulfillmentType,
      status: OrderStatus.CONFIRMED,
      paymentStatus: PaymentStatus.UNPAID,
      subtotal: quote.subtotal,
      taxAmount: quote.taxAmount,
      discountAmount: quote.discountAmount,
      deliveryFee: quote.deliveryFee,
      total: quote.total,
      ticketNumber,
      notes: dto.notes,
      clientRequestId: dto.clientRequestId,
      staffUser: { connect: { id: staff.id } },
      items: {
        create: quote.lines.map((line) => ({
          menuItemId: line.menuItemId,
          name: line.name,
          description: line.name,
          price: line.unitPrice,
          quantity: line.quantity,
          size: line.size,
          crust: line.crust,
          toppings: line.toppingIds,
          removedIngredients: line.removedIngredients,
        })),
      },
    };

    return this.prisma.order.create({
      data,
      include: { items: true, staffUser: true },
    });
  }

  async findActiveOrders(
    staff: AuthenticatedUser,
    brandSlug?: string,
    locationId?: string,
  ): Promise<Order[]> {
    const location = await this.resolvePosLocation(staff, brandSlug, locationId);

    return this.prisma.order.findMany({
      where: {
        channel: OrderChannel.POS,
        locationId: location.id,
        status: {
          in: [
            OrderStatus.PENDING,
            OrderStatus.CONFIRMED,
            OrderStatus.PREPARING,
            OrderStatus.READY,
          ],
        },
      },
      include: { items: true, staffUser: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async lookupOrder(
    staff: AuthenticatedUser,
    params: {
      id?: string;
      ticketNumber?: number;
      brandSlug?: string;
      locationId?: string;
    },
  ): Promise<Order> {
    const location = await this.resolvePosLocation(
      staff,
      params.brandSlug,
      params.locationId,
    );

    const order = await this.prisma.order.findFirst({
      where: {
        channel: OrderChannel.POS,
        locationId: location.id,
        ...(params.id ? { id: params.id } : {}),
        ...(params.ticketNumber ? { ticketNumber: params.ticketNumber } : {}),
      },
      include: { items: true, staffUser: true },
      orderBy: { createdAt: 'desc' },
    });

    if (!order) {
      throw new NotFoundException('POS order not found');
    }

    return order;
  }

  async updateStatus(id: string, status: OrderStatus): Promise<Order> {
    await this.ensurePosOrder(id);

    return this.prisma.order.update({
      where: { id },
      data: { status },
      include: { items: true, staffUser: true },
    });
  }

  async startCardPayment(
    orderId: string,
    _readerId?: string,
    staff?: AuthenticatedUser,
    inventoryOverrideReason?: string,
  ) {
    const order = await this.ensurePosOrder(orderId);

    if (order.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestException('Order is already paid');
    }

    const location = await this.prisma.location.findUnique({
      where: { id: order.locationId },
    });

    if (!location) {
      throw new NotFoundException('Order location not found');
    }

    await this.inventoryService.assertCanFulfillOrder(orderId, {
      overrideReason: inventoryOverrideReason,
      userId: staff?.id,
      userRole: staff?.role,
    });

    await this.paymentSettingsService.assertCardTerminalEnabled(location.brandId);

    const provider = await this.paymentSettingsService.getCardTerminalProvider(
      location.brandId,
    );
    const amountCents = Math.round(Number(order.total) * 100);

    /* ── Stripe Terminal path ── */
    if (provider === 'STRIPE') {
      const paymentIntent = await this.stripeService.createTerminalPaymentIntent(
        orderId,
        amountCents,
      );

      await this.stripeService.processTerminalPayment(paymentIntent.id);

      const updated = await this.prisma.order.findUniqueOrThrow({
        where: { id: orderId },
        include: { items: true, staffUser: true },
      });

      return {
        orderId: updated.id,
        ticketNumber: updated.ticketNumber,
        paymentStatus: updated.paymentStatus,
        paymentMethod: updated.paymentMethod,
        stripePaymentIntentId: paymentIntent.id,
      };
    }

    /* ── Linkly path (default) ── */
    // Recover-before-retry: never mint a new session while one is in flight.
    if (
      order.paymentStatus === PaymentStatus.PROCESSING &&
      order.linklySessionId
    ) {
      const recovered = await this.recoverLinklyPayment(orderId);
      const recoveredFlags = recovered as {
        paymentStatus: PaymentStatus;
        linklyInProgress?: boolean;
        linklyResponseCode?: string;
        linklyResponseText?: string;
        linklyTxnRef?: string | null;
        linklyRfn?: string | null;
        linklyNotFound?: boolean;
      };

      if (recoveredFlags.paymentStatus === PaymentStatus.PAID) {
        const paidOrder = await this.prisma.order.findUniqueOrThrow({
          where: { id: orderId },
        });
        return {
          orderId: paidOrder.id,
          ticketNumber: paidOrder.ticketNumber,
          paymentStatus: paidOrder.paymentStatus,
          paymentMethod: paidOrder.paymentMethod,
          linklySessionId: paidOrder.linklySessionId,
          linklyTxnRef: paidOrder.linklyTxnRef,
          linklyRfn: paidOrder.linklyRfn,
          linklyResponseCode: recoveredFlags.linklyResponseCode,
          linklyResponseText: recoveredFlags.linklyResponseText,
        };
      }

      if (recoveredFlags.linklyInProgress) {
        throw new ConflictException({
          message:
            'Card payment is still in progress on the pinpad. Wait and recover — do not start a new charge.',
          code: 'LINKLY_IN_PROGRESS',
          orderId,
          linklySessionId: order.linklySessionId,
          linklyTxnRef: order.linklyTxnRef,
          linklyInProgress: true,
        });
      }

      // notFound or FAILED — safe to start a fresh purchase below.
    }

    const credentials = await this.paymentSettingsService.getLinklyCredentials(
      location.brandId,
    );
    // Re-read order in case recover updated status/session fields.
    const freshOrder = await this.ensurePosOrder(orderId);
    const txnRef = (freshOrder.ticketNumber
      ? `T${freshOrder.ticketNumber}${Date.now().toString().slice(-8)}`
      : freshOrder.id.replace(/-/g, '').slice(0, 16)
    ).slice(0, 16);
    const sessionId = this.linklyService.newSessionId();

    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: PaymentStatus.PROCESSING,
        paymentMethod: PaymentMethod.CARD_TERMINAL,
        linklySessionId: sessionId,
        linklyTxnRef: txnRef,
      },
    });

    const result = await this.linklyService.purchase({
      secret: credentials.secret,
      posId: credentials.posId,
      amountCents,
      txnRef,
      sessionId,
      operatorName: this.operatorLabel(staff),
    });

    if (!result.approved) {
      await this.prisma.order.update({
        where: { id: orderId },
        data: { paymentStatus: PaymentStatus.FAILED },
      });

      throw new BadRequestException({
        message:
          result.responseText ||
          `Card declined (${result.responseCode || 'unknown'})`,
        code: 'LINKLY_DECLINED',
        orderId,
        linklySessionId: result.sessionId,
        linklyTxnRef: result.txnRef || txnRef,
        linklyResponseCode: result.responseCode,
        linklyResponseText: result.responseText,
      });
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: PaymentStatus.PAID,
        paymentMethod: PaymentMethod.CARD_TERMINAL,
        paidAt: new Date(),
        linklySessionId: result.sessionId,
        linklyRfn: result.rfn ?? null,
        linklyTxnRef: result.txnRef || txnRef,
        notes: freshOrder.notes
          ? `${freshOrder.notes}\nLinkly REF=${result.hostRef ?? ''} RFN=${result.rfn ?? ''}`
          : `Linkly REF=${result.hostRef ?? ''} RFN=${result.rfn ?? ''}`,
      },
      include: { items: true, staffUser: true },
    });

    await this.crmService.linkOrderById(orderId);
    await this.inventoryService.deductForPaidOrder(orderId);

    return {
      orderId: updated.id,
      ticketNumber: updated.ticketNumber,
      paymentStatus: updated.paymentStatus,
      paymentMethod: updated.paymentMethod,
      linklySessionId: result.sessionId,
      linklyTxnRef: result.txnRef || txnRef,
      linklyRfn: result.rfn ?? null,
      linklyResponseCode: result.responseCode,
      linklyResponseText: result.responseText,
    };
  }

  /**
   * POS orders at this location still in PROCESSING card payment (last 24h).
   * Used for startup / power-fail recovery on the register.
   */
  async findUnresolvedCardPayments(
    staff: AuthenticatedUser,
    brandSlug?: string,
    locationId?: string,
  ) {
    const location = await this.resolvePosLocation(staff, brandSlug, locationId);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const orders = await this.prisma.order.findMany({
      where: {
        channel: OrderChannel.POS,
        locationId: location.id,
        paymentStatus: PaymentStatus.PROCESSING,
        paymentMethod: PaymentMethod.CARD_TERMINAL,
        createdAt: { gte: since },
        linklySessionId: { not: null },
      },
      select: {
        id: true,
        ticketNumber: true,
        total: true,
        createdAt: true,
        paymentStatus: true,
        linklyTxnRef: true,
        linklySessionId: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return orders.map((o) => ({
      id: o.id,
      ticketNumber: o.ticketNumber,
      total: Number(o.total),
      createdAt: o.createdAt,
      paymentStatus: o.paymentStatus,
      linklyTxnRef: o.linklyTxnRef,
      linklySessionId: o.linklySessionId,
    }));
  }

  async getPaymentStatus(orderId: string) {
    const order = await this.ensurePosOrder(orderId);

    return {
      orderId: order.id,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      paidAt: order.paidAt,
      linklySessionId: order.linklySessionId,
      linklyRfn: order.linklyRfn,
      linklyTxnRef: order.linklyTxnRef,
    };
  }

  /**
   * Recover after timeout/power fail: GET Linkly transaction status for the
   * session saved on the order, then mark PAID / FAILED accordingly.
   */
  async recoverLinklyPayment(orderId: string) {
    const order = await this.ensurePosOrder(orderId);

    if (order.paymentStatus === PaymentStatus.PAID) {
      return this.getPaymentStatus(orderId);
    }

    if (!order.linklySessionId) {
      throw new BadRequestException(
        'No Linkly session on this order — cannot recover status.',
      );
    }

    const location = await this.prisma.location.findUnique({
      where: { id: order.locationId },
    });
    if (!location) {
      throw new NotFoundException('Order location not found');
    }

    const credentials = await this.paymentSettingsService.getLinklyCredentials(
      location.brandId,
    );

    const status = await this.linklyService.getTransactionStatus({
      secret: credentials.secret,
      posId: credentials.posId,
      sessionId: order.linklySessionId,
    });

    if (status.inProgress) {
      return {
        ...this.getPaymentStatusShape(order),
        linklyHttpStatus: status.httpStatus,
        linklyInProgress: true,
      };
    }

    if (status.notFound) {
      await this.prisma.order.update({
        where: { id: orderId },
        data: { paymentStatus: PaymentStatus.FAILED },
      });
      return {
        orderId,
        paymentStatus: PaymentStatus.FAILED,
        paymentMethod: order.paymentMethod,
        paidAt: null,
        linklySessionId: order.linklySessionId,
        linklyTxnRef: order.linklyTxnRef,
        linklyRfn: order.linklyRfn,
        linklyHttpStatus: 404,
        linklyNotFound: true,
        message:
          'Linkly has no record of this session — safe to retry the card payment.',
      };
    }

    const result = status.result;
    if (!result) {
      throw new BadRequestException('Empty Linkly status response.');
    }

    if (result.approved) {
      const updated = await this.prisma.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: PaymentStatus.PAID,
          paymentMethod: PaymentMethod.CARD_TERMINAL,
          paidAt: new Date(),
          linklyRfn: result.rfn ?? order.linklyRfn,
          linklyTxnRef: result.txnRef || order.linklyTxnRef,
        },
      });
      await this.crmService.linkOrderById(orderId);
      await this.inventoryService.deductForPaidOrder(orderId);
      return {
        orderId: updated.id,
        paymentStatus: updated.paymentStatus,
        paymentMethod: updated.paymentMethod,
        paidAt: updated.paidAt,
        linklySessionId: updated.linklySessionId,
        linklyRfn: updated.linklyRfn,
        linklyTxnRef: updated.linklyTxnRef,
        linklyResponseCode: result.responseCode,
        linklyResponseText: result.responseText,
      };
    }

    await this.prisma.order.update({
      where: { id: orderId },
      data: { paymentStatus: PaymentStatus.FAILED },
    });

    return {
      orderId,
      paymentStatus: PaymentStatus.FAILED,
      paymentMethod: order.paymentMethod,
      paidAt: null,
      linklySessionId: order.linklySessionId,
      linklyTxnRef: order.linklyTxnRef,
      linklyRfn: order.linklyRfn,
      linklyResponseCode: result.responseCode,
      linklyResponseText: result.responseText,
    };
  }

  /**
   * Full card refund via Linkly (TxnType R) using stored RFN.
   */
  async refundCardPayment(
    orderId: string,
    staff?: AuthenticatedUser,
    amountCents?: number,
  ) {
    const order = await this.ensurePosOrder(orderId);

    if (order.paymentStatus === PaymentStatus.REFUNDED) {
      return {
        orderId: order.id,
        paymentStatus: order.paymentStatus,
        alreadyRefunded: true,
      };
    }

    if (order.paymentStatus !== PaymentStatus.PAID) {
      throw new BadRequestException('Only paid orders can be refunded.');
    }

    if (order.paymentMethod !== PaymentMethod.CARD_TERMINAL) {
      throw new BadRequestException(
        'This order was not paid via Linkly card terminal.',
      );
    }

    const rfn =
      order.linklyRfn?.trim() || this.parseLinklyRfnFromNotes(order.notes);
    if (!rfn) {
      throw new BadRequestException(
        'Missing Linkly RFN for this order — cannot refund on the pinpad.',
      );
    }

    const location = await this.prisma.location.findUnique({
      where: { id: order.locationId },
    });
    if (!location) {
      throw new NotFoundException('Order location not found');
    }

    const credentials = await this.paymentSettingsService.getLinklyCredentials(
      location.brandId,
    );

    const fullCents = Math.round(Number(order.total) * 100);
    const refundCents =
      amountCents != null && amountCents > 0 ? amountCents : fullCents;
    if (refundCents > fullCents) {
      throw new BadRequestException('Refund amount exceeds order total.');
    }

    const txnRef = (`R${order.ticketNumber ?? ''}${Date.now().toString().slice(-8)}`).slice(
      0,
      16,
    );
    const sessionId = this.linklyService.newSessionId();

    const result = await this.linklyService.refund({
      secret: credentials.secret,
      posId: credentials.posId,
      amountCents: refundCents,
      txnRef,
      rfn,
      sessionId,
      operatorName: this.operatorLabel(staff),
    });

    if (!result.approved) {
      throw new BadRequestException(
        result.responseText ||
          `Refund declined (${result.responseCode || 'unknown'})`,
      );
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: PaymentStatus.REFUNDED,
        notes: order.notes
          ? `${order.notes}\nLinkly REFUND REF=${result.hostRef ?? ''} session=${result.sessionId}`
          : `Linkly REFUND REF=${result.hostRef ?? ''} session=${result.sessionId}`,
      },
    });

    await this.inventoryService.restockForRefundedOrder(orderId);

    return {
      orderId: updated.id,
      paymentStatus: updated.paymentStatus,
      linklySessionId: result.sessionId,
      linklyResponseCode: result.responseCode,
      linklyResponseText: result.responseText,
      refundAmountCents: refundCents,
    };
  }

  async runLinklySettlement(
    brandSlug: string | undefined,
    settlementType: 'S' | 'P' | 'L' = 'S',
  ) {
    const slug = brandSlug?.trim().toLowerCase();
    if (!slug) {
      throw new BadRequestException(
        'Store (brand) is required. Select a store on this POS device.',
      );
    }

    const brand = await this.prisma.brand.findFirst({
      where: { slug, isActive: true },
      select: { id: true },
    });
    if (!brand) {
      throw new NotFoundException(`Store "${slug}" not found`);
    }

    await this.paymentSettingsService.assertCardTerminalEnabled(brand.id);
    const credentials = await this.paymentSettingsService.getLinklyCredentials(
      brand.id,
    );

    const result = await this.linklyService.settlement({
      secret: credentials.secret,
      posId: credentials.posId,
      settlementType,
    });

    if (!result.success) {
      throw new BadRequestException(
        result.responseText ||
          `Settlement failed (${result.responseCode || 'unknown'})`,
      );
    }

    return {
      success: true,
      settlementType,
      linklySessionId: result.sessionId,
      linklyResponseCode: result.responseCode,
      linklyResponseText: result.responseText,
    };
  }

  private getPaymentStatusShape(order: Order) {
    return {
      orderId: order.id,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      paidAt: order.paidAt,
      linklySessionId: order.linklySessionId,
      linklyRfn: order.linklyRfn,
      linklyTxnRef: order.linklyTxnRef,
    };
  }

  private parseLinklyRfnFromNotes(notes: string | null | undefined): string | null {
    if (!notes) return null;
    const match = notes.match(/\bRFN=([^\s\n]+)/);
    const value = match?.[1]?.trim();
    return value && value !== 'undefined' ? value : null;
  }

  private operatorLabel(staff?: AuthenticatedUser): string {
    if (!staff) return 'POS';
    const name = `${staff.firstName ?? ''} ${staff.lastName ?? ''}`.trim();
    return name || 'POS';
  }

  async markCashPaid(
    orderId: string,
    staff?: AuthenticatedUser,
    inventoryOverrideReason?: string,
  ): Promise<Order> {
    const order = await this.ensurePosOrder(orderId);

    if (order.paymentStatus === PaymentStatus.PAID) {
      await this.inventoryService.deductForPaidOrder(orderId);
      return order;
    }

    const location = await this.prisma.location.findUnique({
      where: { id: order.locationId },
    });

    if (!location) {
      throw new NotFoundException('Order location not found');
    }

    await this.inventoryService.assertCanFulfillOrder(orderId, {
      overrideReason: inventoryOverrideReason,
      userId: staff?.id,
      userRole: staff?.role,
    });

    await this.paymentSettingsService.assertCashEnabled(location.brandId);

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: PaymentStatus.PAID,
        paymentMethod: PaymentMethod.CASH,
        paidAt: new Date(),
      },
      include: { items: true, staffUser: true },
    });

    await this.crmService.linkOrderById(orderId);
    await this.inventoryService.deductForPaidOrder(orderId);
    return updated;
  }

  private async resolvePosLocation(
    staff: AuthenticatedUser,
    brandSlug?: string,
    locationId?: string,
  ): Promise<Location> {
    const slug = brandSlug?.trim().toLowerCase();
    if (!slug) {
      throw new BadRequestException(
        'Store (brand) is required. Select a store on this POS device.',
      );
    }

    const resolvedLocationId = locationId?.trim();
    if (!resolvedLocationId) {
      throw new BadRequestException(
        'Location is required. Select a location on this POS device.',
      );
    }

    await this.assertStaffCanAccessStore(staff, slug, resolvedLocationId);

    const location = await this.prisma.location.findFirst({
      where: {
        id: resolvedLocationId,
        isActive: true,
        brand: { slug, isActive: true },
      },
    });

    if (!location) {
      throw new BadRequestException(
        'Location is invalid for the selected store.',
      );
    }

    return location;
  }

  private async assertStaffCanAccessStore(
    staff: AuthenticatedUser,
    brandSlug: string,
    locationId?: string,
  ): Promise<void> {
    if (staff.role === UserRole.ADMIN) {
      return;
    }

    const membership = await this.prisma.userStore.findFirst({
      where: {
        userId: staff.id,
        isActive: true,
        store: { slug: brandSlug, isActive: true },
      },
    });

    if (!membership) {
      throw new ForbiddenException(
        `You do not have POS access to store "${brandSlug}".`,
      );
    }

    if (
      membership.locationId &&
      locationId &&
      membership.locationId !== locationId
    ) {
      throw new ForbiddenException(
        'You do not have POS access to this location.',
      );
    }
  }

  private async ensurePosOrder(orderId: string): Promise<Order> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });

    if (!order || order.channel !== OrderChannel.POS) {
      throw new NotFoundException('POS order not found');
    }

    return order;
  }

  private async nextTicketNumber(locationId: string): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const latest = await this.prisma.order.findFirst({
      where: {
        channel: OrderChannel.POS,
        locationId,
        createdAt: { gte: startOfDay },
        ticketNumber: { not: null },
      },
      orderBy: { ticketNumber: 'desc' },
      select: { ticketNumber: true },
    });

    return (latest?.ticketNumber ?? 0) + 1;
  }
}
