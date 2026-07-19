import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Order, Prisma, UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { BrandsService } from '../brands/brands.service';
import { CrmService } from '../crm/crm.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderSchedulingService } from './order-scheduling.service';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderSchedulingService: OrderSchedulingService,
    private readonly brandsService: BrandsService,
    private readonly crmService: CrmService,
  ) {}

  async create(
    dto: CreateOrderDto,
    user?: AuthenticatedUser,
    brandSlug?: string,
  ): Promise<Order> {
    const scheduledAt = new Date(dto.scheduledAt);
    const location = await this.brandsService.resolveDefaultLocation(brandSlug);

    await this.orderSchedulingService.assertScheduledAtValid(scheduledAt, brandSlug);
    await this.orderSchedulingService.assertMinOrderAmount(dto.subtotal, brandSlug);
    this.orderSchedulingService.assertDeliveryAddress(dto.deliveryMode, dto);

    if (!user && (!dto.guestName?.trim() || !dto.guestEmail?.trim())) {
      throw new BadRequestException(
        'Guest name and email are required for checkout.',
      );
    }

    if (!dto.guestPhone?.trim()) {
      throw new BadRequestException('Phone number is required for checkout.');
    }

    const data: Prisma.OrderCreateInput = {
      location: { connect: { id: location.id } },
      deliveryMode: dto.deliveryMode,
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
          description: item.description,
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

    const email = order.guestEmail || order.user?.email || dto.guestEmail?.trim() || null;
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

    return this.prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true, user: true },
    });
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

  private async ensureExists(id: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id } });

    if (!order) {
      throw new NotFoundException('Order not found');
    }
  }
}
