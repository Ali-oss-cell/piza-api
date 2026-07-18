import {
  BadRequestException,
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
import { BrandsService } from '../brands/brands.service';
import { DEFAULT_BRAND_SLUG } from '../common/constants/brands';
import { PaymentSettingsService } from '../payment-settings/payment-settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { PricingService } from '../pricing/pricing.service';
import { StripeService } from '../payments/stripe.service';
import { CreatePosOrderDto } from './dto/create-pos-order.dto';
import { QuoteRequestDto } from '../pricing/dto/quote-request.dto';

@Injectable()
export class PosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricingService: PricingService,
    private readonly stripeService: StripeService,
    private readonly brandsService: BrandsService,
    private readonly paymentSettingsService: PaymentSettingsService,
  ) {}

  quote(dto: QuoteRequestDto) {
    return this.pricingService.quote(dto.items);
  }

  getPaymentMethods(brandSlug?: string) {
    return this.paymentSettingsService.getPosMethods(brandSlug);
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

  async startCardPayment(orderId: string, readerId?: string) {
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

    await this.paymentSettingsService.assertCardTerminalEnabled(location.brandId);

    const amountCents = Math.round(Number(order.total) * 100);
    const paymentIntent = await this.stripeService.createTerminalPaymentIntent(
      order.id,
      amountCents,
    );

    const resolvedReaderId =
      readerId ?? location.stripeTerminalReaderId ?? undefined;

    await this.stripeService.processTerminalPayment(
      paymentIntent.id,
      resolvedReaderId,
    );

    return {
      orderId: order.id,
      paymentIntentId: paymentIntent.id,
      paymentStatus: PaymentStatus.PROCESSING,
    };
  }

  async getPaymentStatus(orderId: string) {
    const order = await this.ensurePosOrder(orderId);

    return {
      orderId: order.id,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      paidAt: order.paidAt,
    };
  }

  async markCashPaid(orderId: string): Promise<Order> {
    const order = await this.ensurePosOrder(orderId);

    if (order.paymentStatus === PaymentStatus.PAID) {
      return order;
    }

    const location = await this.prisma.location.findUnique({
      where: { id: order.locationId },
    });

    if (!location) {
      throw new NotFoundException('Order location not found');
    }

    await this.paymentSettingsService.assertCashEnabled(location.brandId);

    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: PaymentStatus.PAID,
        paymentMethod: PaymentMethod.CASH,
        paidAt: new Date(),
      },
      include: { items: true, staffUser: true },
    });
  }

  private async resolvePosLocation(
    staff: AuthenticatedUser,
    brandSlug?: string,
    locationId?: string,
  ): Promise<Location> {
    const slug = brandSlug?.trim().toLowerCase() || DEFAULT_BRAND_SLUG;
    await this.assertStaffCanAccessStore(staff, slug);

    if (locationId) {
      const location = await this.prisma.location.findFirst({
        where: {
          id: locationId,
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

    return this.brandsService.resolveDefaultLocation(slug);
  }

  private async assertStaffCanAccessStore(
    staff: AuthenticatedUser,
    brandSlug: string,
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
