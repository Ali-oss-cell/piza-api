import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  AuditAction,
  DeliveryMode,
  FulfillmentType,
  Location,
  Order,
  OrderChannel,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PosDiscountType,
  Prisma,
  UserRole,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
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

const MANAGER_ACTION_TYPE = 'manager_action';

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
    private readonly jwtService: JwtService,
  ) {}

  quote(dto: QuoteRequestDto) {
    return this.pricingService.quote(dto.items, { discount: dto.discount });
  }

  getPaymentMethods(brandSlug?: string, locationId?: string) {
    const slug = brandSlug?.trim().toLowerCase();
    if (!slug) {
      throw new BadRequestException(
        'Store (brand) is required. Select a store on this POS device.',
      );
    }
    return this.paymentSettingsService.getPosMethods(slug, locationId);
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
    const openShift = await this.getOpenShift(location.id);
    if (location.requireOpenShift && !openShift && !location.posTrainingMode) {
      throw new BadRequestException(
        'Open a shift before taking orders (or ask a manager to override require-shift).',
      );
    }

    const discount =
      dto.discountType != null
        ? {
            type: dto.discountType,
            value: dto.discountValue,
            reason: dto.discountReason,
          }
        : undefined;

    if (discount && discount.type !== PosDiscountType.COMP && (discount.value ?? 0) > 0) {
      await this.assertManagerActionToken(dto.managerActionToken);
    }
    if (discount?.type === PosDiscountType.COMP) {
      await this.assertManagerActionToken(dto.managerActionToken);
    }

    const quote = await this.pricingService.quote(dto.items, { discount });
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
      discountType: dto.discountType,
      discountReason: dto.discountReason,
      deliveryFee: quote.deliveryFee,
      total: quote.total,
      ticketNumber,
      notes: dto.notes,
      guestName: dto.customerName,
      guestPhone: dto.customerPhone,
      tableNumber: dto.tableNumber,
      pagerNumber: dto.pagerNumber,
      registerId: dto.registerId,
      isTraining: location.posTrainingMode,
      clientRequestId: dto.clientRequestId,
      staffUser: { connect: { id: staff.id } },
      ...(openShift ? { shift: { connect: { id: openShift.id } } } : {}),
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

    const order = await this.prisma.order.create({
      data,
      include: { items: true, staffUser: true },
    });

    if (quote.discountAmount > 0) {
      await this.prisma.auditEvent.create({
        data: {
          actorUserId: staff.id,
          storeId: location.brandId,
          action: AuditAction.POS_DISCOUNT,
          message: `POS discount $${quote.discountAmount} on ticket #${ticketNumber}`,
          payload: {
            orderId: order.id,
            discountType: dto.discountType,
            discountValue: dto.discountValue,
            reason: dto.discountReason,
          },
        },
      });
    }

    return order;
  }

  async findActiveOrders(
    staff: AuthenticatedUser,
    brandSlug?: string,
    locationId?: string,
  ): Promise<Order[]> {
    const location = await this.resolvePosLocation(staff, brandSlug, locationId);

    return this.prisma.order.findMany({
      where: {
        locationId: location.id,
        paymentStatus: PaymentStatus.PAID,
        isTraining: false,
        status: {
          in: [
            OrderStatus.PENDING,
            OrderStatus.CONFIRMED,
            OrderStatus.PREPARING,
            OrderStatus.READY,
            OrderStatus.COMPLETED,
          ],
        },
        channel: {
          in: [OrderChannel.POS, OrderChannel.WEB, OrderChannel.PHONE],
        },
      },
      include: { items: true, staffUser: true },
      orderBy: { createdAt: 'desc' },
      take: 80,
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

    await this.paymentSettingsService.assertCardTerminalEnabled(
      location.brandId,
      location.id,
    );

    const provider = await this.paymentSettingsService.getCardTerminalProvider(
      location.brandId,
      location.id,
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
      location.id,
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

    let result;
    try {
      result = await this.linklyService.purchase({
        secret: credentials.secret,
        posId: credentials.posId,
        amountCents,
        txnRef,
        sessionId,
        operatorName: this.operatorLabel(staff),
      });
    } catch (error: unknown) {
      // VPP may have finished (approve/decline) even if Cloud HTTP timed out.
      const recovered = await this.recoverLinklyPayment(orderId).catch(
        () => null,
      );
      if (recovered?.paymentStatus === PaymentStatus.PAID) {
        const paidOrder = await this.prisma.order.findUniqueOrThrow({
          where: { id: orderId },
        });
        const paidFlags = recovered as {
          linklyResponseCode?: string;
          linklyResponseText?: string;
        };
        return {
          orderId: paidOrder.id,
          ticketNumber: paidOrder.ticketNumber,
          paymentStatus: paidOrder.paymentStatus,
          paymentMethod: paidOrder.paymentMethod,
          linklySessionId: paidOrder.linklySessionId,
          linklyTxnRef: paidOrder.linklyTxnRef,
          linklyRfn: paidOrder.linklyRfn,
          linklyResponseCode: paidFlags.linklyResponseCode,
          linklyResponseText: paidFlags.linklyResponseText,
        };
      }
      if (
        recovered &&
        typeof recovered === 'object' &&
        (recovered as { linklyInProgress?: boolean }).linklyInProgress
      ) {
        throw new ConflictException({
          message:
            'Card payment is still in progress on the pinpad. Wait and recover — do not start a new charge.',
          code: 'LINKLY_IN_PROGRESS',
          orderId,
          linklySessionId: sessionId,
          linklyTxnRef: txnRef,
          linklyInProgress: true,
        });
      }
      if (recovered?.paymentStatus === PaymentStatus.FAILED) {
        const failed = recovered as {
          linklyResponseText?: string;
          linklyResponseCode?: string;
          message?: string;
        };
        throw new BadRequestException({
          message:
            failed.linklyResponseText ||
            failed.message ||
            'Card payment failed on pinpad.',
          code: 'LINKLY_DECLINED',
          orderId,
          linklySessionId: sessionId,
          linklyTxnRef: txnRef,
          linklyResponseCode: failed.linklyResponseCode,
          linklyResponseText: failed.linklyResponseText,
        });
      }
      throw error;
    }

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
      location.id,
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
      location.id,
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
    locationId?: string,
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

    await this.paymentSettingsService.assertCardTerminalEnabled(
      brand.id,
      locationId,
    );
    const credentials = await this.paymentSettingsService.getLinklyCredentials(
      brand.id,
      locationId,
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

  async verifyPin(pin: string, staff: AuthenticatedUser) {
    const users = await this.prisma.user.findMany({
      where: {
        posPinHash: { not: null },
        OR: [
          { id: staff.id },
          { role: { in: [UserRole.MANAGER, UserRole.ADMIN, UserRole.STAFF] } },
          {
            storeMemberships: {
              some: { userId: staff.id, isActive: true },
            },
          },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
        posPinHash: true,
        email: true,
      },
      take: 200,
    });

    // Prefer store-scoped staff: load memberships for current user's stores
    const membershipStoreIds = await this.prisma.userStore.findMany({
      where: { userId: staff.id, isActive: true },
      select: { storeId: true },
    });
    const storeIds = membershipStoreIds.map((m) => m.storeId);

    const candidates =
      storeIds.length > 0
        ? await this.prisma.user.findMany({
            where: {
              posPinHash: { not: null },
              OR: [
                { role: { in: [UserRole.ADMIN, UserRole.MANAGER] } },
                {
                  storeMemberships: {
                    some: { storeId: { in: storeIds }, isActive: true },
                  },
                },
              ],
            },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              role: true,
              posPinHash: true,
              email: true,
            },
          })
        : users;

    for (const user of candidates) {
      if (!user.posPinHash) continue;
      const ok = await bcrypt.compare(pin, user.posPinHash);
      if (!ok) continue;

      const managerActionToken =
        user.role === UserRole.MANAGER || user.role === UserRole.ADMIN
          ? await this.jwtService.signAsync(
              {
                sub: user.id,
                type: MANAGER_ACTION_TYPE,
                role: user.role,
              },
              { expiresIn: '5m' },
            )
          : null;

      return {
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          email: user.email,
        },
        managerActionToken,
        canApproveManagerActions: Boolean(managerActionToken),
      };
    }

    throw new UnauthorizedException('Invalid PIN');
  }

  async setPin(
    targetUserId: string,
    pin: string,
    actor: AuthenticatedUser,
  ) {
    if (
      actor.role !== UserRole.MANAGER &&
      actor.role !== UserRole.ADMIN &&
      actor.id !== targetUserId
    ) {
      throw new ForbiddenException('Only managers can set another user PIN.');
    }
    if (!/^\d{4,6}$/.test(pin)) {
      throw new BadRequestException('PIN must be 4–6 digits.');
    }
    const hash = await bcrypt.hash(pin, 12);
    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { posPinHash: hash },
    });
    await this.prisma.auditEvent.create({
      data: {
        actorUserId: actor.id,
        action: AuditAction.POS_PIN_SET,
        message: `POS PIN set for user ${targetUserId}`,
        payload: { targetUserId },
      },
    });
    return { ok: true };
  }

  async listStaffForPin(staff: AuthenticatedUser, brandSlug?: string) {
    const slug = brandSlug?.trim().toLowerCase();
    if (!slug) {
      throw new BadRequestException('Store is required.');
    }
    const brand = await this.prisma.brand.findFirst({
      where: { slug, isActive: true },
    });
    if (!brand) throw new NotFoundException('Store not found');

    const members = await this.prisma.userStore.findMany({
      where: { storeId: brand.id, isActive: true },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
            posPinHash: true,
          },
        },
      },
    });

    return members.map((m) => ({
      id: m.user.id,
      firstName: m.user.firstName,
      lastName: m.user.lastName,
      role: m.user.role,
      hasPin: Boolean(m.user.posPinHash),
    }));
  }

  async voidUnpaidOrder(
    orderId: string,
    reason: string,
    managerActionToken: string,
    staff: AuthenticatedUser,
  ) {
    await this.assertManagerActionToken(managerActionToken);
    const order = await this.ensurePosOrder(orderId);
    if (order.paymentStatus === PaymentStatus.PAID) {
      throw new BadRequestException('Paid orders must be refunded, not voided.');
    }
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: OrderStatus.CANCELLED,
        paymentStatus: PaymentStatus.VOID,
        notes: [order.notes, `VOID: ${reason}`].filter(Boolean).join('\n'),
      },
      include: { items: true },
    });
    await this.prisma.auditEvent.create({
      data: {
        actorUserId: staff.id,
        action: AuditAction.POS_VOID_ORDER,
        message: `Voided unpaid order ${orderId}: ${reason}`,
        payload: { orderId, reason },
      },
    });
    return updated;
  }

  async getOpenShift(locationId: string) {
    return this.prisma.posShift.findFirst({
      where: { locationId, closedAt: null },
      orderBy: { openedAt: 'desc' },
    });
  }

  async openShift(
    staff: AuthenticatedUser,
    brandSlug: string | undefined,
    locationId: string | undefined,
    openingFloat = 0,
    registerId?: string,
  ) {
    const location = await this.resolvePosLocation(staff, brandSlug, locationId);
    const existing = await this.getOpenShift(location.id);
    if (existing) {
      throw new ConflictException('A shift is already open for this location.');
    }
    const shift = await this.prisma.posShift.create({
      data: {
        locationId: location.id,
        openedByUserId: staff.id,
        openingFloat,
        registerId,
      },
    });
    await this.prisma.auditEvent.create({
      data: {
        actorUserId: staff.id,
        storeId: location.brandId,
        action: AuditAction.POS_SHIFT_OPEN,
        message: `Opened shift ${shift.id}`,
        payload: { shiftId: shift.id, openingFloat },
      },
    });
    return shift;
  }

  async getShiftReport(shiftId: string) {
    const shift = await this.prisma.posShift.findUnique({
      where: { id: shiftId },
    });
    if (!shift) throw new NotFoundException('Shift not found');

    const createdAtFilter: { gte: Date; lte?: Date } = { gte: shift.openedAt };
    if (shift.closedAt) {
      createdAtFilter.lte = shift.closedAt;
    }
    const orders = await this.prisma.order.findMany({
      where: {
        channel: OrderChannel.POS,
        isTraining: false,
        OR: [
          { shiftId },
          { locationId: shift.locationId, createdAt: createdAtFilter },
        ],
      },
    });

    const paid = orders.filter((o) => o.paymentStatus === PaymentStatus.PAID);
    const cashSalesTotal = paid
      .filter((o) => o.paymentMethod === PaymentMethod.CASH)
      .reduce((s, o) => s + Number(o.total), 0);
    const cardTotal = paid
      .filter((o) => o.paymentMethod === PaymentMethod.CARD_TERMINAL)
      .reduce((s, o) => s + Number(o.total), 0);
    const discountTotal = paid.reduce((s, o) => s + Number(o.discountAmount), 0);
    const voidCount = orders.filter(
      (o) =>
        o.paymentStatus === PaymentStatus.VOID ||
        o.status === OrderStatus.CANCELLED,
    ).length;
    const refundTotal = orders
      .filter((o) => o.paymentStatus === PaymentStatus.REFUNDED)
      .reduce((s, o) => s + Number(o.total), 0);
    const expectedCash = Number(shift.openingFloat) + cashSalesTotal - refundTotal;

    return {
      shift,
      cashSalesTotal: this.roundMoney(cashSalesTotal),
      cardTotal: this.roundMoney(cardTotal),
      discountTotal: this.roundMoney(discountTotal),
      voidCount,
      refundTotal: this.roundMoney(refundTotal),
      expectedCash: this.roundMoney(expectedCash),
      orderCount: paid.length,
    };
  }

  async closeShift(
    shiftId: string,
    closingCountedCash: number,
    staff: AuthenticatedUser,
  ) {
    const report = await this.getShiftReport(shiftId);
    if (report.shift.closedAt) {
      throw new BadRequestException('Shift already closed.');
    }
    const variance = this.roundMoney(
      closingCountedCash - report.expectedCash,
    );
    const closed = await this.prisma.posShift.update({
      where: { id: shiftId },
      data: {
        closedAt: new Date(),
        closedByUserId: staff.id,
        closingCountedCash,
        expectedCash: report.expectedCash,
        cardTotal: report.cardTotal,
        cashSalesTotal: report.cashSalesTotal,
        discountTotal: report.discountTotal,
        voidCount: report.voidCount,
        refundTotal: report.refundTotal,
        variance,
        reportSnapshot: report as unknown as Prisma.InputJsonValue,
      },
    });
    await this.prisma.auditEvent.create({
      data: {
        actorUserId: staff.id,
        action: AuditAction.POS_SHIFT_CLOSE,
        message: `Closed shift ${shiftId} variance ${variance}`,
        payload: { shiftId, variance, closingCountedCash },
      },
    });
    return { shift: closed, report: { ...report, variance } };
  }

  async listFavourites(staff: AuthenticatedUser, brandSlug?: string, locationId?: string) {
    const location = await this.resolvePosLocation(staff, brandSlug, locationId);
    return this.prisma.posFavouriteItem.findMany({
      where: { locationId: location.id },
      include: { menuItem: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async addFavourite(
    menuItemId: string,
    staff: AuthenticatedUser,
    brandSlug?: string,
    locationId?: string,
  ) {
    const location = await this.resolvePosLocation(staff, brandSlug, locationId);
    return this.prisma.posFavouriteItem.upsert({
      where: {
        locationId_menuItemId: { locationId: location.id, menuItemId },
      },
      create: { locationId: location.id, menuItemId },
      update: {},
      include: { menuItem: true },
    });
  }

  async removeFavourite(
    menuItemId: string,
    staff: AuthenticatedUser,
    brandSlug?: string,
    locationId?: string,
  ) {
    const location = await this.resolvePosLocation(staff, brandSlug, locationId);
    await this.prisma.posFavouriteItem.deleteMany({
      where: { locationId: location.id, menuItemId },
    });
    return { ok: true };
  }

  async findOrdersByPhone(
    phone: string,
    staff: AuthenticatedUser,
    brandSlug?: string,
    locationId?: string,
  ) {
    const location = await this.resolvePosLocation(staff, brandSlug, locationId);
    const normalized = phone.replace(/\D/g, '');
    return this.prisma.order.findMany({
      where: {
        locationId: location.id,
        channel: OrderChannel.POS,
        guestPhone: { contains: normalized.slice(-8) },
        paymentStatus: PaymentStatus.PAID,
      },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  }

  async toggleTraining(
    enabled: boolean,
    managerActionToken: string,
    staff: AuthenticatedUser,
    brandSlug?: string,
    locationId?: string,
  ) {
    await this.assertManagerActionToken(managerActionToken);
    const location = await this.resolvePosLocation(staff, brandSlug, locationId);
    const updated = await this.prisma.location.update({
      where: { id: location.id },
      data: { posTrainingMode: enabled },
    });
    await this.prisma.auditEvent.create({
      data: {
        actorUserId: staff.id,
        storeId: location.brandId,
        action: AuditAction.POS_TRAINING_TOGGLE,
        message: `Training mode ${enabled ? 'ON' : 'OFF'}`,
        payload: { locationId: location.id, enabled },
      },
    });
    return {
      posTrainingMode: updated.posTrainingMode,
      requireOpenShift: updated.requireOpenShift,
    };
  }

  async updatePrinterSettings(
    staff: AuthenticatedUser,
    brandSlug: string | undefined,
    locationId: string | undefined,
    dto: {
      receiptPrinterHost?: string | null;
      receiptPrinterPort?: number | null;
      kitchenPrinterHost?: string | null;
      kitchenPrinterPort?: number | null;
      requireOpenShift?: boolean;
    },
  ) {
    if (staff.role !== UserRole.MANAGER && staff.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Manager required');
    }
    const location = await this.resolvePosLocation(staff, brandSlug, locationId);
    return this.prisma.location.update({
      where: { id: location.id },
      data: {
        receiptPrinterHost: dto.receiptPrinterHost,
        receiptPrinterPort: dto.receiptPrinterPort ?? undefined,
        kitchenPrinterHost: dto.kitchenPrinterHost,
        kitchenPrinterPort: dto.kitchenPrinterPort ?? undefined,
        requireOpenShift: dto.requireOpenShift,
      },
      select: {
        id: true,
        receiptPrinterHost: true,
        receiptPrinterPort: true,
        kitchenPrinterHost: true,
        kitchenPrinterPort: true,
        requireOpenShift: true,
        posTrainingMode: true,
      },
    });
  }

  async getLocationPosSettings(
    staff: AuthenticatedUser,
    brandSlug?: string,
    locationId?: string,
  ) {
    const location = await this.resolvePosLocation(staff, brandSlug, locationId);
    const openShift = await this.getOpenShift(location.id);
    return {
      locationId: location.id,
      receiptPrinterHost: location.receiptPrinterHost,
      receiptPrinterPort: location.receiptPrinterPort,
      kitchenPrinterHost: location.kitchenPrinterHost,
      kitchenPrinterPort: location.kitchenPrinterPort,
      requireOpenShift: location.requireOpenShift,
      posTrainingMode: location.posTrainingMode,
      openShift,
    };
  }

  async cashRefund(
    orderId: string,
    reason: string,
    managerActionToken: string,
    staff: AuthenticatedUser,
    amount?: number,
  ) {
    await this.assertManagerActionToken(managerActionToken);
    const order = await this.ensurePosOrder(orderId);
    if (order.paymentStatus !== PaymentStatus.PAID) {
      throw new BadRequestException('Only paid orders can be refunded.');
    }
    if (order.paymentMethod !== PaymentMethod.CASH) {
      throw new BadRequestException('Use card refund for card payments.');
    }
    const refundAmount = amount ?? Number(order.total);
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: PaymentStatus.REFUNDED,
        notes: [order.notes, `CASH REFUND $${refundAmount}: ${reason}`]
          .filter(Boolean)
          .join('\n'),
      },
      include: { items: true },
    });
    await this.inventoryService.restockForRefundedOrder(orderId);

    await this.prisma.auditEvent.create({
      data: {
        actorUserId: staff.id,
        action: AuditAction.POS_REFUND,
        message: `Cash refund $${refundAmount} on ${orderId}`,
        payload: { orderId, refundAmount, reason },
      },
    });
    return updated;
  }

  async printEscPos(
    staff: AuthenticatedUser,
    brandSlug: string | undefined,
    locationId: string | undefined,
    target: 'receipt' | 'kitchen',
    text: string,
  ) {
    const location = await this.resolvePosLocation(staff, brandSlug, locationId);
    const host =
      target === 'kitchen'
        ? location.kitchenPrinterHost
        : location.receiptPrinterHost;
    const port =
      (target === 'kitchen'
        ? location.kitchenPrinterPort
        : location.receiptPrinterPort) ?? 9100;

    if (!host) {
      throw new BadRequestException(
        `No ${target} printer configured for this location.`,
      );
    }

    const net = await import('net');
    await new Promise<void>((resolve, reject) => {
      const socket = net.createConnection({ host, port }, () => {
        socket.write(text, () => {
          socket.end();
          resolve();
        });
      });
      socket.setTimeout(5000);
      socket.on('timeout', () => {
        socket.destroy();
        reject(new BadRequestException('Printer connection timed out'));
      });
      socket.on('error', (err) => reject(err));
    });

    return { ok: true, host, port };
  }

  private async assertManagerActionToken(token?: string) {
    if (!token) {
      throw new ForbiddenException('Manager PIN approval required.');
    }
    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: string;
        type?: string;
        role?: string;
      }>(token);
      if (payload.type !== MANAGER_ACTION_TYPE) {
        throw new ForbiddenException('Invalid manager token.');
      }
      if (
        payload.role !== UserRole.MANAGER &&
        payload.role !== UserRole.ADMIN
      ) {
        throw new ForbiddenException('Manager role required.');
      }
    } catch {
      throw new ForbiddenException('Manager PIN approval expired or invalid.');
    }
  }

  private roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
