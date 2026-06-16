import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Order, Prisma, UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateOrderDto, user?: AuthenticatedUser): Promise<Order> {
    const data: Prisma.OrderCreateInput = {
      deliveryMode: dto.deliveryMode,
      subtotal: dto.subtotal,
      deliveryFee: dto.deliveryFee,
      total: dto.total,
      guestEmail: user ? undefined : dto.guestEmail,
      guestName: user ? undefined : dto.guestName,
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

    return this.prisma.order.create({
      data,
      include: { items: true, user: true },
    });
  }

  findAll(): Promise<Order[]> {
    return this.prisma.order.findMany({
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
