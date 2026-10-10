import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  DealDiscountType,
  DeliveryMode,
  FulfillmentType,
  Order,
  OrderChannel,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PosDiscountType,
  Prisma,
  UserRole,
} from '@prisma/client';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { BrandsService } from '../brands/brands.service';
import { CrmService } from '../crm/crm.service';
import { DealsService } from '../deals/deals.service';
import { PaymentSettingsService } from '../payment-settings/payment-settings.service';
import { StripeService } from '../payments/stripe.service';
import { QuoteLineDto } from '../pricing/dto/quote-request.dto';
import { PricingService } from '../pricing/pricing.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderSchedulingService } from './order-scheduling.service';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

export type CreateWebOrderResult = Order & {
  requiresPayment: boolean;
  clientSecret: string | null;
  publishableKey: string | null;
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderSchedulingService: OrderSchedulingService,
    private readonly brandsService: BrandsService,
    private readonly crmService: CrmService,
    private readonly dealsService: DealsService,
    private readonly paymentSettings: PaymentSettingsService,
    private readonly stripeService: StripeService,
    private readonly pricingService: PricingService,
  ) {}

  async create(
    dto: CreateOrderDto,
    user?: AuthenticatedUser,
    brandSlug?: string,
  ): Promise<CreateWebOrderResult> {
    const scheduledAt = new Date(dto.scheduledAt);
    const location = await this.brandsService.resolveOrderLocation(
      brandSlug,
      dto.locationId,
    );

    await this.orderSchedulingService.assertScheduledAtValid(
      scheduledAt,
      brandSlug,
      location.id,
    );
    this.orderSchedulingService.assertDeliveryAddress(dto.deliveryMode, dto);

    if (!user && (!dto.guestName?.trim() || !dto.guestEmail?.trim())) {
      throw new BadRequestException(
        'Guest name and email are required for checkout.',
      );
    }

    if (!dto.guestPhone?.trim()) {
      throw new BadRequestException('Phone number is required for checkout.');
    }

    const fulfillmentType =
      dto.deliveryMode === DeliveryMode.DELIVERY
        ? FulfillmentType.DELIVERY
        : FulfillmentType.PICKUP;

    const ticketNumber = await this.nextTicketNumber(location.id);
    const onlineConfig = await this.paymentSettings.getOnlineCheckoutConfig(
      location.brandId,
    );

    const usesServerPricing = dto.items.some(
      (item) => item.type === 'COMBO' || !!item.comboDealId,
    );

    let subtotal = dto.subtotal;
    let itemCreates: Prisma.OrderItemCreateWithoutOrderInput[];

    if (usesServerPricing) {
      const quoteLines: QuoteLineDto[] = dto.items.map((item) => {
        if (item.type === 'COMBO' || item.comboDealId) {
          return {
            type: 'COMBO' as const,
            comboDealId: item.comboDealId,
            selections: item.selections,
          };
        }
        if (!item.menuItemId) {
          throw new BadRequestException(
            'menuItemId is required when using server pricing',
          );
        }
        return {
          type: 'ITEM' as const,
          menuItemId: item.menuItemId,
          quantity: item.quantity ?? 1,
          size: item.size,
          crust: item.crust,
          toppingIds: item.toppings,
          removedIngredients: item.removedIngredients,
        };
      });

      const quote = await this.pricingService.quote(quoteLines, {
        deliveryFee: dto.deliveryFee,
      });
      subtotal = quote.subtotal;
      itemCreates = quote.lines.map((line) => ({
        menuItemId: line.menuItemId,
        name: line.name,
        description: line.name,
        price: line.unitPrice,
        quantity: line.quantity,
        size: line.size,
        crust: line.crust,
        toppings: line.toppingIds,
        removedIngredients: line.removedIngredients,
        comboDealId: line.comboDealId,
        comboInstanceId: line.comboInstanceId,
        isComboHeader: line.isComboHeader ?? false,
      }));
    } else {
      itemCreates = dto.items.map((item) => ({
        menuItemId: item.menuItemId,
        name: item.name ?? 'Item',
        description: item.description ?? '',
        price: item.price ?? 0,
        quantity: item.quantity ?? 1,
        size: item.size,
        crust: item.crust,
        toppings: item.toppings,
        removedIngredients: item.removedIngredients ?? [],
      }));
    }

    await this.orderSchedulingService.assertMinOrderAmount(
      subtotal,
      brandSlug,
      location.id,
    );

    const promo = dto.promoCode?.trim()
      ? await this.dealsService.applyPromoCode(
          dto.promoCode,
          subtotal,
          location.brandId,
        )
      : null;
    const discountAmount = promo?.discountAmount ?? 0;
    const total =
      promo || usesServerPricing
        ? Math.max(
            0,
            Math.round((subtotal + dto.deliveryFee - discountAmount) * 100) /
              100,
          )
        : dto.total;
    const isDelivery = dto.deliveryMode === DeliveryMode.DELIVERY;
    const hasCoordinates =
      isDelivery &&
      dto.deliveryLatitude !== undefined &&
      dto.deliveryLongitude !== undefined;

    const data: Prisma.OrderCreateInput = {
      location: { connect: { id: location.id } },
      channel: OrderChannel.WEB,
      deliveryMode: dto.deliveryMode,
      fulfillmentType,
      status: OrderStatus.PENDING,
      paymentStatus: PaymentStatus.UNPAID,
      ticketNumber,
      subtotal,
      deliveryFee: dto.deliveryFee,
      total,
      promoCode: promo?.code,
      discountAmount,
      discountType: promo
        ? promo.discountType === DealDiscountType.PERCENTAGE
          ? PosDiscountType.PERCENT
          : PosDiscountType.AMOUNT
        : undefined,
      discountReason: promo ? `Promo: ${promo.title}` : undefined,
      scheduledAt,
      notes: dto.notes?.trim() || undefined,
      guestEmail: user ? undefined : dto.guestEmail?.trim(),
      guestName: user ? undefined : dto.guestName?.trim(),
      guestPhone: dto.guestPhone?.trim(),
      deliveryAddressLine1: dto.deliveryAddressLine1?.trim(),
      deliveryAddressLine2: dto.deliveryAddressLine2?.trim() || undefined,
      deliverySuburb: dto.deliverySuburb?.trim(),
      deliveryState: dto.deliveryState?.trim() || 'VIC',
      deliveryPostcode: dto.deliveryPostcode?.trim(),
      deliveryLatitude: hasCoordinates ? dto.deliveryLatitude : undefined,
      deliveryLongitude: hasCoordinates ? dto.deliveryLongitude : undefined,
      user: user ? { connect: { id: user.id } } : undefined,
      items: {
        create: itemCreates,
      },
    };

    const order = await this.prisma.order.create({
      data,
      include: { items: true, user: true },
    });

    const email =
      order.guestEmail || order.user?.email || dto.guestEmail?.trim() || null;
    const name =
      order.guestName ||
      (order.user
        ? `${order.user.firstName} ${order.user.lastName}`.trim()
        : dto.guestName?.trim() || null);

    await this.crmService.upsertFromOrderContact({
      brandId: location.brandId,
      orderId: order.id,
      phone: order.guestPhone,
      email,
      name,
    });

    let requiresPayment = false;
    let clientSecret: string | null = null;
    let publishableKey: string | null = null;

    if (onlineConfig.enabled) {
      if (!onlineConfig.publishableKey) {
        throw new ServiceUnavailableException(
          'Stripe online is enabled but publishable key is missing. Add it in Admin → Infrastructure → Stripe.',
        );
      }

      const amountCents = Math.round(Number(order.total) * 100);
      const paymentIntent = await this.stripeService.createOnlinePaymentIntent({
        orderId: order.id,
        amountCents,
        customerEmail: email,
      });

      requiresPayment = true;
      clientSecret = paymentIntent.client_secret;
      publishableKey = onlineConfig.publishableKey;
    }

    const fresh = await this.prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true, user: true },
    });

    return Object.assign(fresh, {
      requiresPayment,
      clientSecret,
      publishableKey,
    });
  }

  /**
   * Public confirmation polling — guests need payment/ticket status without admin JWT.
   */
  async getCheckoutStatus(id: string): Promise<{
    id: string;
    ticketNumber: number | null;
    status: OrderStatus;
    paymentStatus: PaymentStatus;
    paymentMethod: PaymentMethod | null;
    total: Prisma.Decimal;
    fulfillmentType: FulfillmentType;
    channel: OrderChannel;
  }> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        ticketNumber: true,
        status: true,
        paymentStatus: true,
        paymentMethod: true,
        total: true,
        fulfillmentType: true,
        channel: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    return order;
  }

  /** Guest: sync order to Stripe PaymentIntent status after card form succeeds. */
  async confirmOnlinePayment(id: string) {
    await this.stripeService.confirmOnlineOrderPayment(id);
    return this.getCheckoutStatus(id);
  }

  async findAll(brandSlug?: string): Promise<Order[]> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);

    return this.prisma.order.findMany({
      where: { location: { brandId } },
      include: { items: true, user: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, user?: AuthenticatedUser): Promise<Order> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { items: true, user: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (user && user.role !== UserRole.ADMIN && order.userId !== user.id) {
      throw new ForbiddenException('You can only access your own orders');
    }

    return order;
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto): Promise<Order> {
    await this.ensureExists(id);

    return this.prisma.order.update({
      where: { id },
      data: { status: dto.status },
      include: { items: true, user: true },
    });
  }

  private async nextTicketNumber(locationId: string): Promise<number> {
    const latest = await this.prisma.order.findFirst({
      where: {
        locationId,
        ticketNumber: { not: null },
      },
      orderBy: { ticketNumber: 'desc' },
      select: { ticketNumber: true },
    });

    return (latest?.ticketNumber ?? 0) + 1;
  }

  private async ensureExists(id: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id } });

    if (!order) {
      throw new NotFoundException('Order not found');
    }
  }
}
