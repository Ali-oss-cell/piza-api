import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import {
  AuditAction,
  Prisma,
  StockItem,
  StockMovement,
  StockMovementType,
  StockUnit,
  UserRole,
} from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { BrandsService } from '../brands/brands.service';
import {
  melbourneDayKey,
  parseMelbourneDay,
  parseMelbourneDayEnd,
} from '../common/utils/melbourne-time';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStockItemDto } from './dto/create-stock-item.dto';
import {
  CreateStockMovementDto,
  ReplaceRecipeDto,
} from './dto/create-stock-movement.dto';
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
  stockItemName?: string;
  stockItemUnit?: string;
  brandId: string;
  type: string;
  deltaQty: string;
  qtyAfter: string;
  reason: string | null;
  unitCost: string | null;
  receivedAt: Date | null;
  orderId: string | null;
  createdById: string | null;
  createdByName: string | null;
  createdAt: Date;
};

export type InventorySummaryResponse = {
  totalItems: number;
  activeItems: number;
  lowStockCount: number;
};

export type InventoryStatsKpis = {
  soldQty: number;
  soldCostEst: number;
  wasteQty: number;
  wasteCostEst: number;
  receiveQty: number;
  receiveCost: number;
  refundQty: number;
  netChange: number;
  lowStockCount: number;
  ordersTouched: number;
};

export type InventoryStatsDailyRow = {
  date: string;
  soldQty: number;
  wasteQty: number;
  receiveQty: number;
  receiveCost: number;
};

export type InventoryStatsSkuRow = {
  stockItemId: string;
  name: string;
  qty: number;
  costEst: number;
};

export type InventoryStatsResponse = {
  range: { from: string; to: string };
  previousRange: { from: string; to: string };
  kpis: InventoryStatsKpis;
  previousKpis: InventoryStatsKpis;
  daily: InventoryStatsDailyRow[];
  topSold: InventoryStatsSkuRow[];
  topWaste: InventoryStatsSkuRow[];
};

export type RecipeLineResponse = {
  id: string;
  stockItemId: string;
  stockItemName: string;
  stockItemUnit: string;
  qtyPerUnit: string;
  sizeKey: string;
};

export type MenuItemRecipeResponse = {
  menuItemId: string;
  menuItemName: string;
  menuItemNumber: number;
  categorySlug: string;
  lines: RecipeLineResponse[];
};

export type ToppingRecipeResponse = {
  toppingId: string;
  toppingLabel: string;
  categorySlug: string;
  lines: RecipeLineResponse[];
};

export type CrustRecipeResponse = {
  crustOptionId: string;
  crustLabel: string;
  lines: RecipeLineResponse[];
};

export type UsagePreviewRow = {
  stockItemId: string;
  name: string;
  unit: string;
  required: string;
  onHand: string;
  shortfall: string;
};

type OrderForUsage = {
  id: string;
  location: { brandId: string };
  items: Array<{
    menuItemId: string | null;
    quantity: number;
    size: string | null;
    crust: string | null;
    toppings: Prisma.JsonValue;
  }>;
};

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly brandsService: BrandsService,
    private readonly auditService: AuditService,
  ) {}

  normalizeSizeKey(size: string): 'small' | 'large' | 'family' {
    const normalized = size.toLowerCase();
    if (normalized.startsWith('s')) {
      return 'small';
    }
    if (normalized.startsWith('f')) {
      return 'family';
    }
    return 'large';
  }

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

  async getStats(
    brandSlug?: string,
    from?: string,
    to?: string,
  ): Promise<InventoryStatsResponse> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const range = this.resolveStatsRange(from, to);
    const durationMs = range.to.getTime() - range.from.getTime();
    const previousRange = {
      from: new Date(range.from.getTime() - durationMs - 1),
      to: new Date(range.from.getTime() - 1),
    };

    const [currentMoves, previousMoves, summary] = await Promise.all([
      this.loadStatsMovements(brandId, range.from, range.to),
      this.loadStatsMovements(brandId, previousRange.from, previousRange.to),
      this.getSummary(brandSlug),
    ]);

    const kpis = this.aggregateStatsKpis(currentMoves, summary.lowStockCount);
    const previousKpis = this.aggregateStatsKpis(
      previousMoves,
      summary.lowStockCount,
    );

    return {
      range: {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      },
      previousRange: {
        from: previousRange.from.toISOString(),
        to: previousRange.to.toISOString(),
      },
      kpis,
      previousKpis,
      daily: this.aggregateStatsDaily(currentMoves, range.from, range.to),
      topSold: this.aggregateTopSkus(currentMoves, StockMovementType.SALE),
      topWaste: this.aggregateTopSkus(currentMoves, StockMovementType.WASTE),
    };
  }

  private resolveStatsRange(
    from?: string,
    to?: string,
  ): { from: Date; to: Date } {
    const parsedFrom = parseMelbourneDay(from);
    const parsedTo = parseMelbourneDayEnd(to);

    if (parsedFrom || parsedTo) {
      const finalFrom = parsedFrom ?? parsedTo!;
      const finalTo = parsedTo ?? parseMelbourneDayEnd(from) ?? parsedFrom!;
      if (finalFrom.getTime() > finalTo.getTime()) {
        throw new BadRequestException('"from" must be on or before "to".');
      }
      return { from: finalFrom, to: finalTo };
    }

    // Default: this Melbourne calendar week (Mon 00:00 → Sun 23:59:59.999).
    const todayKey = melbourneDayKey(new Date());
    const [y, m, d] = todayKey.split('-').map(Number);
    const utcNoon = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    // JS getUTCDay: 0 Sun … 6 Sat. Convert to Mon=0 … Sun=6.
    const dow = (utcNoon.getUTCDay() + 6) % 7;
    const monday = new Date(utcNoon);
    monday.setUTCDate(utcNoon.getUTCDate() - dow);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    const mondayKey = monday.toISOString().slice(0, 10);
    const sundayKey = sunday.toISOString().slice(0, 10);
    return {
      from: parseMelbourneDay(mondayKey)!,
      to: parseMelbourneDayEnd(sundayKey)!,
    };
  }

  private async loadStatsMovements(
    brandId: string,
    from: Date,
    to: Date,
  ): Promise<
    Array<{
      type: StockMovementType;
      deltaQty: Prisma.Decimal;
      unitCost: Prisma.Decimal | null;
      orderId: string | null;
      createdAt: Date;
      stockItemId: string;
      stockItemName: string;
      stockItemCost: Prisma.Decimal | null;
    }>
  > {
    const rows = await this.prisma.stockMovement.findMany({
      where: {
        brandId,
        createdAt: { gte: from, lte: to },
      },
      select: {
        type: true,
        deltaQty: true,
        unitCost: true,
        orderId: true,
        createdAt: true,
        stockItemId: true,
        stockItem: {
          select: { name: true, costPerUnit: true },
        },
      },
    });

    return rows.map((row) => ({
      type: row.type,
      deltaQty: row.deltaQty,
      unitCost: row.unitCost,
      orderId: row.orderId,
      createdAt: row.createdAt,
      stockItemId: row.stockItemId,
      stockItemName: row.stockItem.name,
      stockItemCost: row.stockItem.costPerUnit,
    }));
  }

  private aggregateStatsKpis(
    moves: Array<{
      type: StockMovementType;
      deltaQty: Prisma.Decimal;
      unitCost: Prisma.Decimal | null;
      orderId: string | null;
      stockItemCost: Prisma.Decimal | null;
    }>,
    lowStockCount: number,
  ): InventoryStatsKpis {
    let soldQty = 0;
    let soldCostEst = 0;
    let wasteQty = 0;
    let wasteCostEst = 0;
    let receiveQty = 0;
    let receiveCost = 0;
    let refundQty = 0;
    let netChange = 0;
    const orders = new Set<string>();

    for (const move of moves) {
      const delta = Number(move.deltaQty);
      const abs = Math.abs(delta);
      const itemCost = move.stockItemCost ? Number(move.stockItemCost) : 0;
      netChange += delta;

      switch (move.type) {
        case StockMovementType.SALE:
          soldQty += abs;
          soldCostEst += abs * itemCost;
          if (move.orderId) {
            orders.add(move.orderId);
          }
          break;
        case StockMovementType.WASTE:
          wasteQty += abs;
          wasteCostEst += abs * itemCost;
          break;
        case StockMovementType.RECEIVE:
          receiveQty += abs;
          if (move.unitCost != null) {
            receiveCost += abs * Number(move.unitCost);
          }
          break;
        case StockMovementType.REFUND:
          refundQty += abs;
          if (move.orderId) {
            orders.add(move.orderId);
          }
          break;
        default:
          break;
      }
    }

    return {
      soldQty: round3(soldQty),
      soldCostEst: round2(soldCostEst),
      wasteQty: round3(wasteQty),
      wasteCostEst: round2(wasteCostEst),
      receiveQty: round3(receiveQty),
      receiveCost: round2(receiveCost),
      refundQty: round3(refundQty),
      netChange: round3(netChange),
      lowStockCount,
      ordersTouched: orders.size,
    };
  }

  private aggregateStatsDaily(
    moves: Array<{
      type: StockMovementType;
      deltaQty: Prisma.Decimal;
      unitCost: Prisma.Decimal | null;
      createdAt: Date;
    }>,
    from: Date,
    to: Date,
  ): InventoryStatsDailyRow[] {
    const byDay = new Map<string, InventoryStatsDailyRow>();

    // Seed every Melbourne day in range so charts have continuous x-axis.
    const cursor = new Date(from.getTime());
    while (cursor.getTime() <= to.getTime()) {
      const key = melbourneDayKey(cursor);
      if (!byDay.has(key)) {
        byDay.set(key, {
          date: key,
          soldQty: 0,
          wasteQty: 0,
          receiveQty: 0,
          receiveCost: 0,
        });
      }
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    for (const move of moves) {
      const key = melbourneDayKey(move.createdAt);
      let row = byDay.get(key);
      if (!row) {
        row = {
          date: key,
          soldQty: 0,
          wasteQty: 0,
          receiveQty: 0,
          receiveCost: 0,
        };
        byDay.set(key, row);
      }
      const abs = Math.abs(Number(move.deltaQty));
      if (move.type === StockMovementType.SALE) {
        row.soldQty += abs;
      } else if (move.type === StockMovementType.WASTE) {
        row.wasteQty += abs;
      } else if (move.type === StockMovementType.RECEIVE) {
        row.receiveQty += abs;
        if (move.unitCost != null) {
          row.receiveCost += abs * Number(move.unitCost);
        }
      }
    }

    return [...byDay.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((row) => ({
        date: row.date,
        soldQty: round3(row.soldQty),
        wasteQty: round3(row.wasteQty),
        receiveQty: round3(row.receiveQty),
        receiveCost: round2(row.receiveCost),
      }));
  }

  private aggregateTopSkus(
    moves: Array<{
      type: StockMovementType;
      deltaQty: Prisma.Decimal;
      stockItemId: string;
      stockItemName: string;
      stockItemCost: Prisma.Decimal | null;
    }>,
    type: StockMovementType,
  ): InventoryStatsSkuRow[] {
    const map = new Map<
      string,
      { stockItemId: string; name: string; qty: number; costEst: number }
    >();

    for (const move of moves) {
      if (move.type !== type) {
        continue;
      }
      const abs = Math.abs(Number(move.deltaQty));
      const cost = move.stockItemCost ? Number(move.stockItemCost) : 0;
      const current = map.get(move.stockItemId) ?? {
        stockItemId: move.stockItemId,
        name: move.stockItemName,
        qty: 0,
        costEst: 0,
      };
      current.qty += abs;
      current.costEst += abs * cost;
      map.set(move.stockItemId, current);
    }

    return [...map.values()]
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10)
      .map((row) => ({
        stockItemId: row.stockItemId,
        name: row.name,
        qty: round3(row.qty),
        costEst: round2(row.costEst),
      }));
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
    const openingCost =
      dto.costPerUnit === undefined || dto.costPerUnit === null
        ? null
        : new Prisma.Decimal(dto.costPerUnit);

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
          costPerUnit: openingCost,
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
            unitCost: openingCost,
            receivedAt: new Date(),
          },
        });
      }

      return created;
    });

    return this.toItemResponse(item);
  }

  async createItemsBulk(
    dtos: CreateStockItemDto[],
    brandSlug?: string,
  ): Promise<{
    created: StockItemResponse[];
    skipped: Array<{ name: string; reason: string }>;
  }> {
    if (!Array.isArray(dtos) || dtos.length === 0) {
      throw new BadRequestException('At least one stock item is required.');
    }
    if (dtos.length > 500) {
      throw new BadRequestException('Maximum 500 stock items per bulk create.');
    }

    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const existing = await this.prisma.stockItem.findMany({
      where: { brandId },
      select: { name: true },
    });
    const existingNames = new Set(
      existing.map((item) => item.name.trim().toLowerCase()),
    );

    const skipped: Array<{ name: string; reason: string }> = [];
    const toCreate: Array<{
      name: string;
      sku: string | null;
      category: string | null;
      unit: StockUnit;
      qtyOnHand: Prisma.Decimal;
      lowStockAt: Prisma.Decimal | null;
      costPerUnit: Prisma.Decimal | null;
      notes: string | null;
      isActive: boolean;
    }> = [];
    const batchNames = new Set<string>();

    for (const dto of dtos) {
      const name = dto.name?.trim() ?? '';
      if (!name) {
        skipped.push({ name: dto.name ?? '', reason: 'Name is required.' });
        continue;
      }
      const nameKey = name.toLowerCase();
      if (existingNames.has(nameKey) || batchNames.has(nameKey)) {
        skipped.push({ name, reason: 'Already exists.' });
        continue;
      }
      batchNames.add(nameKey);

      const qtyOnHand = new Prisma.Decimal(dto.qtyOnHand ?? 0);
      const openingCost =
        dto.costPerUnit === undefined || dto.costPerUnit === null
          ? null
          : new Prisma.Decimal(dto.costPerUnit);

      toCreate.push({
        name,
        sku: dto.sku?.trim() || null,
        category: dto.category?.trim() || null,
        unit: dto.unit ?? StockUnit.EACH,
        qtyOnHand,
        lowStockAt:
          dto.lowStockAt === undefined || dto.lowStockAt === null
            ? null
            : new Prisma.Decimal(dto.lowStockAt),
        costPerUnit: openingCost,
        notes: dto.notes?.trim() || null,
        isActive: dto.isActive ?? true,
      });
    }

    if (toCreate.length === 0) {
      return { created: [], skipped };
    }

    const createdRows = await this.prisma.$transaction(async (tx) => {
      await tx.stockItem.createMany({
        data: toCreate.map((row) => ({
          brandId,
          name: row.name,
          sku: row.sku,
          category: row.category,
          unit: row.unit,
          qtyOnHand: row.qtyOnHand,
          lowStockAt: row.lowStockAt,
          costPerUnit: row.costPerUnit,
          notes: row.notes,
          isActive: row.isActive,
        })),
        skipDuplicates: true,
      });

      const created = await tx.stockItem.findMany({
        where: {
          brandId,
          name: { in: toCreate.map((row) => row.name) },
        },
      });

      const byName = new Map(created.map((item) => [item.name, item]));
      const openingMoves = toCreate
        .filter((row) => !row.qtyOnHand.isZero())
        .map((row) => {
          const item = byName.get(row.name);
          if (!item) {
            return null;
          }
          return {
            stockItemId: item.id,
            brandId,
            type: StockMovementType.RECEIVE,
            deltaQty: row.qtyOnHand,
            qtyAfter: row.qtyOnHand,
            reason: 'Opening stock',
            unitCost: row.costPerUnit,
            receivedAt: new Date(),
          };
        })
        .filter(Boolean) as Array<{
        stockItemId: string;
        brandId: string;
        type: typeof StockMovementType.RECEIVE;
        deltaQty: Prisma.Decimal;
        qtyAfter: Prisma.Decimal;
        reason: string;
        unitCost: Prisma.Decimal | null;
        receivedAt: Date;
      }>;

      if (openingMoves.length > 0) {
        await tx.stockMovement.createMany({ data: openingMoves });
      }

      return created;
    });

    return {
      created: createdRows.map((item) => this.toItemResponse(item)),
      skipped,
    };
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
        stockItem: { select: { name: true, unit: true } },
        createdBy: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    return movements.map((movement) => this.toMovementResponse(movement));
  }

  async listBrandMovements(
    brandSlug?: string,
    options?: { take?: number; type?: string; stockItemId?: string },
  ): Promise<StockMovementResponse[]> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const take = Math.min(Math.max(options?.take ?? 100, 1), 300);
    const typeFilter =
      options?.type &&
      Object.values(StockMovementType).includes(
        options.type as StockMovementType,
      )
        ? (options.type as StockMovementType)
        : undefined;

    const movements = await this.prisma.stockMovement.findMany({
      where: {
        brandId,
        ...(typeFilter ? { type: typeFilter } : {}),
        ...(options?.stockItemId
          ? { stockItemId: options.stockItemId }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        stockItem: { select: { name: true, unit: true } },
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
    if (dto.type === StockMovementType.SALE) {
      throw new BadRequestException(
        'SALE movements are created automatically when orders are paid.',
      );
    }

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
      let unitCost: Prisma.Decimal | null = null;
      let receivedAt: Date | null = null;
      let nextCostPerUnit: Prisma.Decimal | null | undefined;

      switch (dto.type) {
        case StockMovementType.RECEIVE: {
          const amount = this.requirePositiveQty(dto.qty, 'Receive quantity');
          if (
            dto.unitCost === undefined ||
            Number.isNaN(Number(dto.unitCost))
          ) {
            throw new BadRequestException(
              'Unit cost (AUD) is required when receiving stock.',
            );
          }
          unitCost = new Prisma.Decimal(dto.unitCost);
          if (unitCost.isNegative()) {
            throw new BadRequestException('Unit cost cannot be negative.');
          }
          receivedAt = dto.receivedAt ? new Date(dto.receivedAt) : new Date();
          if (Number.isNaN(receivedAt.getTime())) {
            throw new BadRequestException('Receive date is invalid.');
          }
          delta = amount;
          nextCostPerUnit = this.weightedAverageCost(
            currentQty,
            item.costPerUnit,
            amount,
            unitCost,
          );
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
      if (
        qtyAfter.isNegative() &&
        dto.type !== StockMovementType.RECEIVE
      ) {
        if (
          dto.type === StockMovementType.WASTE ||
          dto.type === StockMovementType.ADJUST
        ) {
          throw new BadRequestException(
            `Insufficient stock. On hand: ${currentQty.toString()}, change: ${delta.toString()}.`,
          );
        }
      }

      const updated = await tx.stockItem.update({
        where: { id: itemId },
        data: {
          qtyOnHand: qtyAfter,
          ...(nextCostPerUnit !== undefined
            ? { costPerUnit: nextCostPerUnit }
            : {}),
        },
      });

      const movement = await tx.stockMovement.create({
        data: {
          stockItemId: itemId,
          brandId,
          type: dto.type,
          deltaQty: delta,
          qtyAfter,
          reason: dto.reason?.trim() || null,
          unitCost,
          receivedAt,
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

  async listRecipes(brandSlug?: string): Promise<MenuItemRecipeResponse[]> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const menuItems = await this.prisma.menuItem.findMany({
      where: { brandId, isActive: true },
      orderBy: [{ categorySlug: 'asc' }, { number: 'asc' }, { name: 'asc' }],
      include: {
        recipeLines: {
          include: {
            stockItem: { select: { id: true, name: true, unit: true } },
          },
          orderBy: [{ sizeKey: 'asc' }, { stockItem: { name: 'asc' } }],
        },
      },
    });

    return menuItems.map((item) => ({
      menuItemId: item.id,
      menuItemName: item.name,
      menuItemNumber: item.number,
      categorySlug: item.categorySlug,
      lines: item.recipeLines.map((line) => this.toRecipeLineResponse(line)),
    }));
  }

  async replaceRecipe(
    menuItemId: string,
    dto: ReplaceRecipeDto,
    brandSlug?: string,
  ): Promise<MenuItemRecipeResponse> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const menuItem = await this.prisma.menuItem.findFirst({
      where: { id: menuItemId, brandId },
    });
    if (!menuItem) {
      throw new NotFoundException('Menu item not found.');
    }

    const normalized = dto.lines.map((line) => ({
      stockItemId: line.stockItemId,
      qtyPerUnit: line.qtyPerUnit,
      sizeKey: (line.sizeKey ?? '').trim().toLowerCase(),
    }));

    const keys = normalized.map((l) => `${l.stockItemId}:${l.sizeKey}`);
    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException(
        'Duplicate stock items for the same size in recipe.',
      );
    }

    await this.assertStockItemsBelongToBrand(
      brandId,
      normalized.map((l) => l.stockItemId),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.menuItemRecipeLine.deleteMany({
        where: { menuItemId, brandId },
      });
      if (normalized.length > 0) {
        await tx.menuItemRecipeLine.createMany({
          data: normalized.map((line) => ({
            brandId,
            menuItemId,
            stockItemId: line.stockItemId,
            sizeKey: line.sizeKey,
            qtyPerUnit: new Prisma.Decimal(line.qtyPerUnit),
          })),
        });
      }
    });

    const recipes = await this.listRecipes(brandSlug);
    const updated = recipes.find((entry) => entry.menuItemId === menuItemId);
    if (!updated) {
      throw new NotFoundException('Menu item not found after save.');
    }
    return updated;
  }

  async listToppingRecipes(
    brandSlug?: string,
  ): Promise<ToppingRecipeResponse[]> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const toppings = await this.prisma.extraTopping.findMany({
      where: { brandId, isActive: true },
      orderBy: [{ categorySlug: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
      include: {
        recipeLines: {
          include: {
            stockItem: { select: { id: true, name: true, unit: true } },
          },
          orderBy: { stockItem: { name: 'asc' } },
        },
      },
    });

    return toppings.map((topping) => ({
      toppingId: topping.id,
      toppingLabel: topping.label,
      categorySlug: topping.categorySlug,
      lines: topping.recipeLines.map((line) =>
        this.toRecipeLineResponse({ ...line, sizeKey: '' }),
      ),
    }));
  }

  async replaceToppingRecipe(
    toppingId: string,
    dto: ReplaceRecipeDto,
    brandSlug?: string,
  ): Promise<ToppingRecipeResponse> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const topping = await this.prisma.extraTopping.findFirst({
      where: { id: toppingId, brandId },
    });
    if (!topping) {
      throw new NotFoundException('Topping not found.');
    }

    const stockIds = dto.lines.map((line) => line.stockItemId);
    if (new Set(stockIds).size !== stockIds.length) {
      throw new BadRequestException('Duplicate stock items in recipe.');
    }
    await this.assertStockItemsBelongToBrand(brandId, stockIds);

    await this.prisma.$transaction(async (tx) => {
      await tx.extraToppingRecipeLine.deleteMany({
        where: { toppingId, brandId },
      });
      if (dto.lines.length > 0) {
        await tx.extraToppingRecipeLine.createMany({
          data: dto.lines.map((line) => ({
            brandId,
            toppingId,
            stockItemId: line.stockItemId,
            qtyPerUnit: new Prisma.Decimal(line.qtyPerUnit),
          })),
        });
      }
    });

    const recipes = await this.listToppingRecipes(brandSlug);
    const updated = recipes.find((entry) => entry.toppingId === toppingId);
    if (!updated) {
      throw new NotFoundException('Topping not found after save.');
    }
    return updated;
  }

  async listCrustRecipes(brandSlug?: string): Promise<CrustRecipeResponse[]> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const crusts = await this.prisma.crustOption.findMany({
      where: { brandId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      include: {
        recipeLines: {
          include: {
            stockItem: { select: { id: true, name: true, unit: true } },
          },
          orderBy: { stockItem: { name: 'asc' } },
        },
      },
    });

    return crusts.map((crust) => ({
      crustOptionId: crust.id,
      crustLabel: crust.label,
      lines: crust.recipeLines.map((line) =>
        this.toRecipeLineResponse({ ...line, sizeKey: '' }),
      ),
    }));
  }

  async replaceCrustRecipe(
    crustOptionId: string,
    dto: ReplaceRecipeDto,
    brandSlug?: string,
  ): Promise<CrustRecipeResponse> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const crust = await this.prisma.crustOption.findFirst({
      where: { id: crustOptionId, brandId },
    });
    if (!crust) {
      throw new NotFoundException('Crust option not found.');
    }

    const stockIds = dto.lines.map((line) => line.stockItemId);
    if (new Set(stockIds).size !== stockIds.length) {
      throw new BadRequestException('Duplicate stock items in recipe.');
    }
    await this.assertStockItemsBelongToBrand(brandId, stockIds);

    await this.prisma.$transaction(async (tx) => {
      await tx.crustOptionRecipeLine.deleteMany({
        where: { crustOptionId, brandId },
      });
      if (dto.lines.length > 0) {
        await tx.crustOptionRecipeLine.createMany({
          data: dto.lines.map((line) => ({
            brandId,
            crustOptionId,
            stockItemId: line.stockItemId,
            qtyPerUnit: new Prisma.Decimal(line.qtyPerUnit),
          })),
        });
      }
    });

    const recipes = await this.listCrustRecipes(brandSlug);
    const updated = recipes.find(
      (entry) => entry.crustOptionId === crustOptionId,
    );
    if (!updated) {
      throw new NotFoundException('Crust option not found after save.');
    }
    return updated;
  }

  async previewUsageForOrder(orderId: string): Promise<UsagePreviewRow[]> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        location: { select: { brandId: true } },
      },
    });
    if (!order) {
      throw new NotFoundException('Order not found.');
    }

    const usage = await this.buildUsageMap(this.prisma, order);
    if (usage.size === 0) {
      return [];
    }

    const stockItems = await this.prisma.stockItem.findMany({
      where: {
        brandId: order.location.brandId,
        id: { in: [...usage.keys()] },
      },
    });
    const byId = new Map(stockItems.map((item) => [item.id, item]));

    const rows: UsagePreviewRow[] = [];
    for (const [stockItemId, required] of usage.entries()) {
      const item = byId.get(stockItemId);
      if (!item) {
        continue;
      }
      const onHand = new Prisma.Decimal(item.qtyOnHand);
      const shortfall = required.gt(onHand)
        ? required.minus(onHand)
        : new Prisma.Decimal(0);
      rows.push({
        stockItemId,
        name: item.name,
        unit: item.unit,
        required: required.toString(),
        onHand: onHand.toString(),
        shortfall: shortfall.toString(),
      });
    }

    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }

  async assertCanFulfillOrder(
    orderId: string,
    options?: {
      overrideReason?: string;
      userId?: string;
      userRole?: UserRole;
    },
  ): Promise<void> {
    const preview = await this.previewUsageForOrder(orderId);
    const shortages = preview.filter((row) =>
      new Prisma.Decimal(row.shortfall).gt(0),
    );
    if (shortages.length === 0) {
      return;
    }

    const overrideReason = options?.overrideReason?.trim();
    if (!overrideReason) {
      throw new HttpException(
        {
          message: 'Insufficient inventory to fulfill this order.',
          code: 'INVENTORY_SHORTAGE',
          shortages,
        },
        HttpStatus.CONFLICT,
      );
    }

    const role = options?.userRole;
    if (role !== UserRole.ADMIN && role !== UserRole.MANAGER) {
      throw new ForbiddenException(
        'Only managers or admins can override inventory shortages.',
      );
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { location: { select: { brandId: true } } },
    });

    await this.auditService.log(
      options?.userId,
      order?.location.brandId ?? null,
      AuditAction.INVENTORY_OVERRIDE,
      `Inventory override for order ${orderId}: ${overrideReason}`,
      {
        orderId,
        reason: overrideReason,
        shortages,
      },
    );
  }

  /**
   * Deduct recipe stock for a paid order. Never throws to callers that
   * should keep payment success — logs and swallows unexpected errors.
   */
  async deductForPaidOrder(orderId: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.stockMovement.findFirst({
          where: { orderId, type: StockMovementType.SALE },
          select: { id: true },
        });
        if (existing) {
          return;
        }

        const order = await tx.order.findUnique({
          where: { id: orderId },
          include: {
            items: true,
            location: { select: { brandId: true } },
          },
        });
        if (!order) {
          return;
        }

        const brandId = order.location.brandId;
        const usage = await this.buildUsageMap(tx, order);
        if (usage.size === 0) {
          return;
        }

        const ticketLabel =
          order.ticketNumber != null
            ? `Order #${order.ticketNumber}`
            : `Order ${order.id.slice(0, 8)}`;

        for (const [stockItemId, consumeQty] of usage.entries()) {
          if (consumeQty.lte(0)) {
            continue;
          }
          const item = await tx.stockItem.findFirst({
            where: { id: stockItemId, brandId },
          });
          if (!item) {
            continue;
          }

          const qtyAfter = item.qtyOnHand.minus(consumeQty);
          await tx.stockItem.update({
            where: { id: stockItemId },
            data: { qtyOnHand: qtyAfter },
          });
          await tx.stockMovement.create({
            data: {
              stockItemId,
              brandId,
              type: StockMovementType.SALE,
              deltaQty: consumeQty.negated(),
              qtyAfter,
              reason: ticketLabel,
              orderId: order.id,
            },
          });
        }
      });
    } catch (error) {
      this.logger.error(
        `Failed to deduct inventory for order ${orderId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Reverse SALE movements for a refunded order. Idempotent on REFUND+orderId.
   * Swallows errors so refund webhooks stay reliable.
   */
  async restockForRefundedOrder(orderId: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const existingRefund = await tx.stockMovement.findFirst({
          where: { orderId, type: StockMovementType.REFUND },
          select: { id: true },
        });
        if (existingRefund) {
          return;
        }

        const sales = await tx.stockMovement.findMany({
          where: { orderId, type: StockMovementType.SALE },
        });
        if (sales.length === 0) {
          return;
        }

        for (const sale of sales) {
          const item = await tx.stockItem.findUnique({
            where: { id: sale.stockItemId },
          });
          if (!item) {
            continue;
          }

          const delta = sale.deltaQty.negated();
          const qtyAfter = item.qtyOnHand.plus(delta);
          await tx.stockItem.update({
            where: { id: item.id },
            data: { qtyOnHand: qtyAfter },
          });
          await tx.stockMovement.create({
            data: {
              stockItemId: item.id,
              brandId: sale.brandId,
              type: StockMovementType.REFUND,
              deltaQty: delta,
              qtyAfter,
              reason: sale.reason
                ? `Refund: ${sale.reason}`
                : `Refund order ${orderId.slice(0, 8)}`,
              orderId,
            },
          });
        }
      });
    } catch (error) {
      this.logger.error(
        `Failed to restock inventory for refunded order ${orderId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  weightedAverageCost(
    oldQty: Prisma.Decimal,
    oldCost: Prisma.Decimal | null,
    recvQty: Prisma.Decimal,
    unitCost: Prisma.Decimal,
  ): Prisma.Decimal {
    const safeOldQty = oldQty.isNegative() ? new Prisma.Decimal(0) : oldQty;
    if (safeOldQty.isZero() || oldCost == null) {
      return unitCost;
    }
    const numerator = safeOldQty.mul(oldCost).plus(recvQty.mul(unitCost));
    const denominator = safeOldQty.plus(recvQty);
    if (denominator.isZero()) {
      return unitCost;
    }
    return numerator.div(denominator).toDecimalPlaces(2);
  }

  private async buildUsageMap(
    tx: Prisma.TransactionClient | PrismaService,
    order: OrderForUsage,
  ): Promise<Map<string, Prisma.Decimal>> {
    const brandId = order.location.brandId;
    const usage = new Map<string, Prisma.Decimal>();

    const add = (stockItemId: string, qty: Prisma.Decimal) => {
      if (qty.lte(0)) {
        return;
      }
      const current = usage.get(stockItemId) ?? new Prisma.Decimal(0);
      usage.set(stockItemId, current.plus(qty));
    };

    const menuItemIds = [
      ...new Set(
        order.items
          .filter((item) => item.menuItemId && item.quantity > 0)
          .map((item) => item.menuItemId as string),
      ),
    ];

    const menuRecipeLines =
      menuItemIds.length > 0
        ? await tx.menuItemRecipeLine.findMany({
            where: { brandId, menuItemId: { in: menuItemIds } },
          })
        : [];

    const recipesByMenuItem = new Map<string, typeof menuRecipeLines>();
    for (const line of menuRecipeLines) {
      const list = recipesByMenuItem.get(line.menuItemId) ?? [];
      list.push(line);
      recipesByMenuItem.set(line.menuItemId, list);
    }

    const [toppings, crusts] = await Promise.all([
      tx.extraTopping.findMany({
        where: { brandId },
        include: { recipeLines: true },
      }),
      tx.crustOption.findMany({
        where: { brandId },
        include: { recipeLines: true },
      }),
    ]);

    const toppingById = new Map(toppings.map((t) => [t.id, t]));
    const toppingByLabel = new Map(
      toppings.map((t) => [t.label.trim().toLowerCase(), t]),
    );
    const toppingBySlug = new Map(
      toppings.map((t) => [t.slug.trim().toLowerCase(), t]),
    );
    const crustById = new Map(crusts.map((c) => [c.id, c]));
    const crustByLabel = new Map(
      crusts.map((c) => [c.label.trim().toLowerCase(), c]),
    );
    const crustBySlug = new Map(
      crusts.map((c) => [c.slug.trim().toLowerCase(), c]),
    );

    for (const item of order.items) {
      if (item.quantity <= 0) {
        continue;
      }

      if (item.menuItemId) {
        const lines = recipesByMenuItem.get(item.menuItemId) ?? [];
        const sizeKey = item.size?.trim()
          ? this.normalizeSizeKey(item.size)
          : null;
        const chosen = new Map<
          string,
          (typeof menuRecipeLines)[number]
        >();

        for (const line of lines) {
          const matchesDefault = line.sizeKey === '';
          const matchesSize =
            sizeKey != null && line.sizeKey === sizeKey;
          if (!matchesDefault && !matchesSize) {
            continue;
          }
          const existing = chosen.get(line.stockItemId);
          if (!existing) {
            chosen.set(line.stockItemId, line);
          } else if (line.sizeKey !== '' && existing.sizeKey === '') {
            chosen.set(line.stockItemId, line);
          }
        }

        for (const line of chosen.values()) {
          add(line.stockItemId, line.qtyPerUnit.mul(item.quantity));
        }
      }

      for (const ref of this.parseToppingRefs(item.toppings)) {
        const topping =
          toppingById.get(ref) ??
          toppingByLabel.get(ref.trim().toLowerCase()) ??
          toppingBySlug.get(ref.trim().toLowerCase());
        if (!topping) {
          continue;
        }
        for (const line of topping.recipeLines) {
          add(line.stockItemId, line.qtyPerUnit.mul(item.quantity));
        }
      }

      if (item.crust?.trim()) {
        const ref = item.crust.trim();
        const crust =
          crustById.get(ref) ??
          crustByLabel.get(ref.toLowerCase()) ??
          crustBySlug.get(ref.toLowerCase());
        if (crust) {
          for (const line of crust.recipeLines) {
            add(line.stockItemId, line.qtyPerUnit.mul(item.quantity));
          }
        }
      }
    }

    return usage;
  }

  private parseToppingRefs(toppings: Prisma.JsonValue): string[] {
    if (!toppings || !Array.isArray(toppings)) {
      return [];
    }
    const refs: string[] = [];
    for (const entry of toppings) {
      if (typeof entry === 'string' && entry.trim()) {
        refs.push(entry.trim());
        continue;
      }
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        const obj = entry as Record<string, unknown>;
        if (typeof obj.id === 'string' && obj.id.trim()) {
          refs.push(obj.id.trim());
        } else if (typeof obj.label === 'string' && obj.label.trim()) {
          refs.push(obj.label.trim());
        } else if (typeof obj.name === 'string' && obj.name.trim()) {
          refs.push(obj.name.trim());
        } else if (typeof obj.slug === 'string' && obj.slug.trim()) {
          refs.push(obj.slug.trim());
        }
      }
    }
    return refs;
  }

  private async assertStockItemsBelongToBrand(
    brandId: string,
    stockIds: string[],
  ): Promise<void> {
    const unique = [...new Set(stockIds)];
    if (unique.length === 0) {
      return;
    }
    const stockItems = await this.prisma.stockItem.findMany({
      where: { brandId, id: { in: unique } },
      select: { id: true },
    });
    if (stockItems.length !== unique.length) {
      throw new BadRequestException(
        'One or more stock items are invalid for this store.',
      );
    }
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

  private toRecipeLineResponse(line: {
    id: string;
    stockItemId: string;
    qtyPerUnit: Prisma.Decimal;
    sizeKey?: string;
    stockItem: { name: string; unit: string };
  }): RecipeLineResponse {
    return {
      id: line.id,
      stockItemId: line.stockItemId,
      stockItemName: line.stockItem.name,
      stockItemUnit: line.stockItem.unit,
      qtyPerUnit: line.qtyPerUnit.toString(),
      sizeKey: line.sizeKey ?? '',
    };
  }

  private toItemResponse(item: StockItem): StockItemResponse {
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
      qtyOnHand: item.qtyOnHand.toString(),
      lowStockAt: item.lowStockAt?.toString() ?? null,
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
      stockItem?: { name: string; unit: string } | null;
      createdBy?: { firstName: string; lastName: string } | null;
    },
  ): StockMovementResponse {
    const createdByName = movement.createdBy
      ? `${movement.createdBy.firstName} ${movement.createdBy.lastName}`.trim()
      : null;

    return {
      id: movement.id,
      stockItemId: movement.stockItemId,
      stockItemName: movement.stockItem?.name,
      stockItemUnit: movement.stockItem?.unit,
      brandId: movement.brandId,
      type: movement.type,
      deltaQty: movement.deltaQty.toString(),
      qtyAfter: movement.qtyAfter.toString(),
      reason: movement.reason,
      unitCost: movement.unitCost?.toString() ?? null,
      receivedAt: movement.receivedAt,
      orderId: movement.orderId,
      createdById: movement.createdById,
      createdByName,
      createdAt: movement.createdAt,
    };
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
