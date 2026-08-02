import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StockItem, StockMovement, StockMovementType } from '@prisma/client';
import { BrandsService } from '../brands/brands.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStockItemDto } from './dto/create-stock-item.dto';
import { CreateStockMovementDto } from './dto/create-stock-movement.dto';
import { UpdateStockItemDto } from './dto/update-stock-item.dto';

export type StockItemResponse = {
  id: string;
  brandId: string;
  name: string;
  sku: string | null;
  category: string | null;
  unit: string;
  qtyOnHand: string;
  lowStockAt: string | null;
  costPerUnit: string | null;
  notes: string | null;
  isActive: boolean;
  isLowStock: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type StockMovementResponse = {
  id: string;
  stockItemId: string;
  brandId: string;
  type: string;
  deltaQty: string;
  qtyAfter: string;
  reason: string | null;
  createdById: string | null;
  createdByName: string | null;
  createdAt: Date;
};

export type InventorySummaryResponse = {
  totalItems: number;
  activeItems: number;
  lowStockCount: number;
};

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandsService: BrandsService,
  ) {}

  async listItems(
    brandSlug?: string,
    options?: { lowStock?: boolean; includeInactive?: boolean },
  ): Promise<StockItemResponse[]> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const items = await this.prisma.stockItem.findMany({
      where: {
        brandId,
        ...(options?.includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    const mapped = items.map((item) => this.toItemResponse(item));
    if (options?.lowStock) {
      return mapped.filter((item) => item.isLowStock);
    }
    return mapped;
  }

  async getSummary(brandSlug?: string): Promise<InventorySummaryResponse> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const items = await this.prisma.stockItem.findMany({
      where: { brandId },
      select: {
        isActive: true,
        qtyOnHand: true,
        lowStockAt: true,
      },
    });

    let lowStockCount = 0;
    let activeItems = 0;
    for (const item of items) {
      if (item.isActive) {
        activeItems += 1;
      }
      if (
        item.isActive &&
        item.lowStockAt != null &&
        item.qtyOnHand.lte(item.lowStockAt)
      ) {
        lowStockCount += 1;
      }
    }

    return {
      totalItems: items.length,
      activeItems,
      lowStockCount,
    };
  }

  async createItem(
    dto: CreateStockItemDto,
    brandSlug?: string,
  ): Promise<StockItemResponse> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('Name is required.');
    }

    const existing = await this.prisma.stockItem.findUnique({
      where: { brandId_name: { brandId, name } },
    });
    if (existing) {
      throw new ConflictException(`Stock item "${name}" already exists.`);
    }

    const qtyOnHand = new Prisma.Decimal(dto.qtyOnHand ?? 0);
    const item = await this.prisma.$transaction(async (tx) => {
      const created = await tx.stockItem.create({
        data: {
          brandId,
          name,
          sku: dto.sku?.trim() || null,
          category: dto.category?.trim() || null,
          unit: dto.unit ?? 'EACH',
          qtyOnHand,
          lowStockAt:
            dto.lowStockAt === undefined || dto.lowStockAt === null
              ? null
              : new Prisma.Decimal(dto.lowStockAt),
          costPerUnit:
            dto.costPerUnit === undefined || dto.costPerUnit === null
              ? null
              : new Prisma.Decimal(dto.costPerUnit),
          notes: dto.notes?.trim() || null,
          isActive: dto.isActive ?? true,
        },
      });

      if (!qtyOnHand.isZero()) {
        await tx.stockMovement.create({
          data: {
            stockItemId: created.id,
            brandId,
            type: StockMovementType.RECEIVE,
            deltaQty: qtyOnHand,
            qtyAfter: qtyOnHand,
            reason: 'Opening stock',
          },
        });
      }

      return created;
    });

    return this.toItemResponse(item);
  }

  async updateItem(
    id: string,
    dto: UpdateStockItemDto,
    brandSlug?: string,
  ): Promise<StockItemResponse> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const existing = await this.prisma.stockItem.findFirst({
      where: { id, brandId },
    });
    if (!existing) {
      throw new NotFoundException('Stock item not found.');
    }

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) {
        throw new BadRequestException('Name is required.');
      }
      if (name !== existing.name) {
        const clash = await this.prisma.stockItem.findUnique({
          where: { brandId_name: { brandId, name } },
        });
        if (clash) {
          throw new ConflictException(`Stock item "${name}" already exists.`);
        }
      }
    }

    const updated = await this.prisma.stockItem.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.sku !== undefined ? { sku: dto.sku?.trim() || null } : {}),
        ...(dto.category !== undefined
          ? { category: dto.category?.trim() || null }
          : {}),
        ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
        ...(dto.lowStockAt !== undefined
          ? {
              lowStockAt:
                dto.lowStockAt === null
                  ? null
                  : new Prisma.Decimal(dto.lowStockAt),
            }
          : {}),
        ...(dto.costPerUnit !== undefined
          ? {
              costPerUnit:
                dto.costPerUnit === null
                  ? null
                  : new Prisma.Decimal(dto.costPerUnit),
            }
          : {}),
        ...(dto.notes !== undefined
          ? { notes: dto.notes?.trim() || null }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });

    return this.toItemResponse(updated);
  }

  async deactivateItem(
    id: string,
    brandSlug?: string,
  ): Promise<StockItemResponse> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const existing = await this.prisma.stockItem.findFirst({
      where: { id, brandId },
    });
    if (!existing) {
      throw new NotFoundException('Stock item not found.');
    }

    const updated = await this.prisma.stockItem.update({
      where: { id },
      data: { isActive: false },
    });
    return this.toItemResponse(updated);
  }

  async listMovements(
    itemId: string,
    brandSlug?: string,
    take = 50,
  ): Promise<StockMovementResponse[]> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const item = await this.prisma.stockItem.findFirst({
      where: { id: itemId, brandId },
      select: { id: true },
    });
    if (!item) {
      throw new NotFoundException('Stock item not found.');
    }

    const movements = await this.prisma.stockMovement.findMany({
      where: { stockItemId: itemId, brandId },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(take, 1), 200),
      include: {
        createdBy: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    return movements.map((movement) => this.toMovementResponse(movement));
  }

  async createMovement(
    itemId: string,
    dto: CreateStockMovementDto,
    userId: string | undefined,
    brandSlug?: string,
  ): Promise<{ item: StockItemResponse; movement: StockMovementResponse }> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);

    const result = await this.prisma.$transaction(async (tx) => {
      const item = await tx.stockItem.findFirst({
        where: { id: itemId, brandId },
      });
      if (!item) {
        throw new NotFoundException('Stock item not found.');
      }

      const currentQty = new Prisma.Decimal(item.qtyOnHand);
      let delta: Prisma.Decimal;

      switch (dto.type) {
        case StockMovementType.RECEIVE: {
          const amount = this.requirePositiveQty(dto.qty, 'Receive quantity');
          delta = amount;
          break;
        }
        case StockMovementType.WASTE: {
          const amount = this.requirePositiveQty(dto.qty, 'Waste quantity');
          delta = amount.negated();
          break;
        }
        case StockMovementType.ADJUST: {
          if (dto.qty === undefined || Number.isNaN(Number(dto.qty))) {
            throw new BadRequestException('Adjust quantity is required.');
          }
          delta = new Prisma.Decimal(dto.qty);
          if (delta.isZero()) {
            throw new BadRequestException('Adjust quantity cannot be zero.');
          }
          break;
        }
        case StockMovementType.COUNT: {
          if (
            dto.countedQty === undefined ||
            Number.isNaN(Number(dto.countedQty))
          ) {
            throw new BadRequestException('Counted quantity is required.');
          }
          const counted = new Prisma.Decimal(dto.countedQty);
          if (counted.isNegative()) {
            throw new BadRequestException(
              'Counted quantity cannot be negative.',
            );
          }
          delta = counted.minus(currentQty);
          break;
        }
        default:
          throw new BadRequestException('Invalid movement type.');
      }

      const qtyAfter = currentQty.plus(delta);
      if (qtyAfter.isNegative()) {
        throw new BadRequestException(
          `Insufficient stock. On hand: ${currentQty.toString()}, change: ${delta.toString()}.`,
        );
      }

      const updated = await tx.stockItem.update({
        where: { id: itemId },
        data: { qtyOnHand: qtyAfter },
      });

      const movement = await tx.stockMovement.create({
        data: {
          stockItemId: itemId,
          brandId,
          type: dto.type,
          deltaQty: delta,
          qtyAfter,
          reason: dto.reason?.trim() || null,
          createdById: userId ?? null,
        },
        include: {
          createdBy: {
            select: { firstName: true, lastName: true },
          },
        },
      });

      return { item: updated, movement };
    });

    return {
      item: this.toItemResponse(result.item),
      movement: this.toMovementResponse(result.movement),
    };
  }

  private requirePositiveQty(
    qty: number | undefined,
    label: string,
  ): Prisma.Decimal {
    if (qty === undefined || Number.isNaN(Number(qty))) {
      throw new BadRequestException(`${label} is required.`);
    }
    const value = new Prisma.Decimal(qty);
    if (value.lte(0)) {
      throw new BadRequestException(`${label} must be greater than zero.`);
    }
    return value;
  }

  private toItemResponse(item: StockItem): StockItemResponse {
    const qtyOnHand = item.qtyOnHand.toString();
    const lowStockAt = item.lowStockAt?.toString() ?? null;
    const isLowStock =
      item.isActive &&
      item.lowStockAt != null &&
      item.qtyOnHand.lte(item.lowStockAt);

    return {
      id: item.id,
      brandId: item.brandId,
      name: item.name,
      sku: item.sku,
      category: item.category,
      unit: item.unit,
      qtyOnHand,
      lowStockAt,
      costPerUnit: item.costPerUnit?.toString() ?? null,
      notes: item.notes,
      isActive: item.isActive,
      isLowStock,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }

  private toMovementResponse(
    movement: StockMovement & {
      createdBy?: { firstName: string; lastName: string } | null;
    },
  ): StockMovementResponse {
    const createdByName = movement.createdBy
      ? `${movement.createdBy.firstName} ${movement.createdBy.lastName}`.trim()
      : null;

    return {
      id: movement.id,
      stockItemId: movement.stockItemId,
      brandId: movement.brandId,
      type: movement.type,
      deltaQty: movement.deltaQty.toString(),
      qtyAfter: movement.qtyAfter.toString(),
      reason: movement.reason,
      createdById: movement.createdById,
      createdByName,
      createdAt: movement.createdAt,
    };
  }
}
