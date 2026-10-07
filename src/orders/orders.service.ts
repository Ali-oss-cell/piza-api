import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  DeliveryMode,
  FulfillmentType,
  Order,
  OrderChannel,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { BrandsService } from '../brands/brands.service';
import { CrmService } from '../crm/crm.service';
import { PaymentSettingsService } from '../payment-settings/payment-settings.service';
import { StripeService } from '../payments/stripe.service';
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
    private readonly paymentSettings: PaymentSettingsService,
    private readonly stripeService: StripeService,
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
    await this.orderSchedulingService.assertMinOrderAmount(
      dto.subtotal,
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

    const data: Prisma.OrderCreateInput = {
      location: { connect: { id: location.id } },
      channel: OrderChannel.WEB,
      deliveryMode: dto.deliveryMode,
      fulfillmentType,
      status: OrderStatus.PENDING,
      paymentStatus: PaymentStatus.UNPAID,
      ticketNumber,
      subtotal: dto.subtotal,
      deliveryFee: dto.deliveryFee,
      total: dto.total,
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
      user: user ? { connect: { id: user.id } } : undefined,
      items: {
        create: dto.items.map((item) => ({
          menuItemId: item.menuItemId,
          name: item.name,
          description: item.description ?? '',
          price: item.price,
          quantity: item.quantity,
          size: item.size,
          crust: item.crust,
          toppings: item.toppings,
          removedIngredients: item.removedIngredients ?? [],
        })),
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
