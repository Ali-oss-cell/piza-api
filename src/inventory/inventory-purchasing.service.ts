import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  PurchaseOrderStatus,
  StockMovementType,
} from '@prisma/client';
import PDFDocument from 'pdfkit';
import { BrandsService } from '../brands/brands.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePurchaseOrderDto,
  ReceivePurchaseOrderDto,
  UpdatePurchaseOrderDto,
} from './dto/purchase-order.dto';
import {
  CreateSupplierDto,
  UpdateSupplierDto,
} from './dto/supplier.dto';
import { InventoryService } from './inventory.service';

export type SupplierResponse = {
  id: string;
  brandId: string;
  name: string;
  phone: string | null;
  email: string | null;
  abn: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type PurchaseOrderLineResponse = {
  id: string;
  stockItemId: string;
  stockItemName: string;
  stockItemUnit: string;
  qtyOrdered: string;
  qtyReceived: string;
  unitCost: string;
  lineTotal: string;
};

export type PurchaseOrderResponse = {
  id: string;
  brandId: string;
  number: number;
  status: PurchaseOrderStatus;
  supplierId: string;
  supplierName: string;
  orderedAt: Date;
  expectedAt: Date | null;
  receivedAt: Date | null;
  notes: string | null;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
  lines: PurchaseOrderLineResponse[];
  total: string;
};

@Injectable()
export class InventoryPurchasingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandsService: BrandsService,
    private readonly inventoryService: InventoryService,
  ) {}

  async listSuppliers(
    brandSlug?: string,
    options?: { includeInactive?: boolean },
  ): Promise<SupplierResponse[]> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const suppliers = await this.prisma.supplier.findMany({
      where: {
        brandId,
        ...(options?.includeInactive ? {} : { isActive: true }),
      },
      orderBy: { name: 'asc' },
    });
    return suppliers.map((s) => this.toSupplierResponse(s));
  }

  async createSupplier(
    dto: CreateSupplierDto,
    brandSlug?: string,
  ): Promise<SupplierResponse> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('Supplier name is required.');
    }

    try {
      const created = await this.prisma.supplier.create({
        data: {
          brandId,
          name,
          phone: dto.phone?.trim() || null,
          email: dto.email?.trim() || null,
          abn: dto.abn?.trim() || null,
          address: dto.address?.trim() || null,
          notes: dto.notes?.trim() || null,
          isActive: dto.isActive ?? true,
        },
      });
      return this.toSupplierResponse(created);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(`Supplier "${name}" already exists.`);
      }
      throw error;
    }
  }

  async updateSupplier(
    id: string,
    dto: UpdateSupplierDto,
    brandSlug?: string,
  ): Promise<SupplierResponse> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const existing = await this.prisma.supplier.findFirst({
      where: { id, brandId },
    });
    if (!existing) {
      throw new NotFoundException('Supplier not found.');
    }

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) {
        throw new BadRequestException('Supplier name is required.');
      }
    }

    try {
      const updated = await this.prisma.supplier.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.phone !== undefined
            ? { phone: dto.phone?.trim() || null }
            : {}),
          ...(dto.email !== undefined
            ? { email: dto.email?.trim() || null }
            : {}),
          ...(dto.abn !== undefined ? { abn: dto.abn?.trim() || null } : {}),
          ...(dto.address !== undefined
            ? { address: dto.address?.trim() || null }
            : {}),
          ...(dto.notes !== undefined
            ? { notes: dto.notes?.trim() || null }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });
      return this.toSupplierResponse(updated);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `Supplier "${dto.name?.trim()}" already exists.`,
        );
      }
      throw error;
    }
  }

  async listPurchaseOrders(
    brandSlug?: string,
  ): Promise<PurchaseOrderResponse[]> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const orders = await this.prisma.purchaseOrder.findMany({
      where: { brandId },
      orderBy: [{ number: 'desc' }],
      include: this.poInclude(),
    });
    return orders.map((po) => this.toPurchaseOrderResponse(po));
  }

  async getPurchaseOrder(
    id: string,
    brandSlug?: string,
  ): Promise<PurchaseOrderResponse> {
    const po = await this.findPurchaseOrder(id, brandSlug);
    return this.toPurchaseOrderResponse(po);
  }

  async createPurchaseOrder(
    dto: CreatePurchaseOrderDto,
    userId: string | undefined,
    brandSlug?: string,
  ): Promise<PurchaseOrderResponse> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, brandId },
    });
    if (!supplier) {
      throw new NotFoundException('Supplier not found.');
    }
    if (dto.lines.length === 0) {
      throw new BadRequestException('At least one line is required.');
    }

    await this.assertPoStockItems(brandId, dto.lines.map((l) => l.stockItemId));

    const stockIds = dto.lines.map((l) => l.stockItemId);
    if (new Set(stockIds).size !== stockIds.length) {
      throw new BadRequestException('Duplicate stock items on purchase order.');
    }

    const expectedAt = this.parseOptionalDate(dto.expectedAt, 'Expected date');

    const created = await this.prisma.$transaction(async (tx) => {
      const agg = await tx.purchaseOrder.aggregate({
        where: { brandId },
        _max: { number: true },
      });
      const number = (agg._max.number ?? 0) + 1;

      return tx.purchaseOrder.create({
        data: {
          brandId,
          supplierId: dto.supplierId,
          number,
          status: PurchaseOrderStatus.DRAFT,
          expectedAt,
          notes: dto.notes?.trim() || null,
          createdById: userId ?? null,
          lines: {
            create: dto.lines.map((line) => ({
              stockItemId: line.stockItemId,
              qtyOrdered: new Prisma.Decimal(line.qtyOrdered),
              unitCost: new Prisma.Decimal(line.unitCost),
            })),
          },
        },
        include: this.poInclude(),
      });
    });

    return this.toPurchaseOrderResponse(created);
  }

  async updatePurchaseOrder(
    id: string,
    dto: UpdatePurchaseOrderDto,
    brandSlug?: string,
  ): Promise<PurchaseOrderResponse> {
    const existing = await this.findPurchaseOrder(id, brandSlug);
    if (existing.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException('Only draft purchase orders can be edited.');
    }

    const brandId = existing.brandId;

    if (dto.supplierId) {
      const supplier = await this.prisma.supplier.findFirst({
        where: { id: dto.supplierId, brandId },
      });
      if (!supplier) {
        throw new NotFoundException('Supplier not found.');
      }
    }

    if (dto.lines) {
      if (dto.lines.length === 0) {
        throw new BadRequestException('At least one line is required.');
      }
      const stockIds = dto.lines.map((l) => l.stockItemId);
      if (new Set(stockIds).size !== stockIds.length) {
        throw new BadRequestException(
          'Duplicate stock items on purchase order.',
        );
      }
      await this.assertPoStockItems(brandId, stockIds);
    }

    const expectedAt =
      dto.expectedAt === undefined
        ? undefined
        : this.parseOptionalDate(dto.expectedAt, 'Expected date');

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.lines) {
        await tx.purchaseOrderLine.deleteMany({
          where: { purchaseOrderId: id },
        });
        await tx.purchaseOrderLine.createMany({
          data: dto.lines.map((line) => ({
            purchaseOrderId: id,
            stockItemId: line.stockItemId,
            qtyOrdered: new Prisma.Decimal(line.qtyOrdered),
            unitCost: new Prisma.Decimal(line.unitCost),
          })),
        });
      }

      return tx.purchaseOrder.update({
        where: { id },
        data: {
          ...(dto.supplierId ? { supplierId: dto.supplierId } : {}),
          ...(dto.expectedAt !== undefined ? { expectedAt } : {}),
          ...(dto.notes !== undefined
            ? { notes: dto.notes?.trim() || null }
            : {}),
        },
        include: this.poInclude(),
      });
    });

    return this.toPurchaseOrderResponse(updated);
  }

  async sendPurchaseOrder(
    id: string,
    brandSlug?: string,
  ): Promise<PurchaseOrderResponse> {
    const existing = await this.findPurchaseOrder(id, brandSlug);
    if (existing.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException('Only draft purchase orders can be sent.');
    }
    if (existing.lines.length === 0) {
      throw new BadRequestException('Cannot send a purchase order with no lines.');
    }

    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: PurchaseOrderStatus.SENT,
        orderedAt: new Date(),
      },
      include: this.poInclude(),
    });
    return this.toPurchaseOrderResponse(updated);
  }

  async cancelPurchaseOrder(
    id: string,
    brandSlug?: string,
  ): Promise<PurchaseOrderResponse> {
    const existing = await this.findPurchaseOrder(id, brandSlug);
    if (
      existing.status === PurchaseOrderStatus.RECEIVED ||
      existing.status === PurchaseOrderStatus.CANCELLED
    ) {
      throw new BadRequestException(
        `Cannot cancel a ${existing.status.toLowerCase()} purchase order.`,
      );
    }

    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.CANCELLED },
      include: this.poInclude(),
    });
    return this.toPurchaseOrderResponse(updated);
  }

  async receivePurchaseOrder(
    id: string,
    dto: ReceivePurchaseOrderDto,
    userId: string | undefined,
    brandSlug?: string,
  ): Promise<PurchaseOrderResponse> {
    const existing = await this.findPurchaseOrder(id, brandSlug);
    if (
      existing.status !== PurchaseOrderStatus.SENT &&
      existing.status !== PurchaseOrderStatus.PARTIAL
    ) {
      throw new BadRequestException(
        'Only sent or partially received purchase orders can be received.',
      );
    }

    const receivedAt = dto.receivedAt
      ? new Date(dto.receivedAt)
      : new Date();
    if (Number.isNaN(receivedAt.getTime())) {
      throw new BadRequestException('Receive date is invalid.');
    }

    const receivePlan = new Map<string, Prisma.Decimal>();
    if (dto.lines && dto.lines.length > 0) {
      const lineIds = new Set(existing.lines.map((l) => l.id));
      for (const entry of dto.lines) {
        if (!lineIds.has(entry.lineId)) {
          throw new BadRequestException(
            `Line ${entry.lineId} is not on this purchase order.`,
          );
        }
        const qty = new Prisma.Decimal(entry.qty);
        if (qty.lte(0)) {
          throw new BadRequestException('Receive quantity must be greater than zero.');
        }
        receivePlan.set(entry.lineId, qty);
      }
    } else {
      for (const line of existing.lines) {
        const remaining = line.qtyOrdered.minus(line.qtyReceived);
        if (remaining.gt(0)) {
          receivePlan.set(line.id, remaining);
        }
      }
    }

    if (receivePlan.size === 0) {
      throw new BadRequestException('Nothing left to receive on this purchase order.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      for (const [lineId, qty] of receivePlan.entries()) {
        const line = existing.lines.find((l) => l.id === lineId);
        if (!line) {
          continue;
        }

        const remaining = line.qtyOrdered.minus(line.qtyReceived);
        if (qty.gt(remaining)) {
          throw new BadRequestException(
            `Cannot receive ${qty.toString()} for ${line.stockItem.name}; remaining ${remaining.toString()}.`,
          );
        }

        const item = await tx.stockItem.findFirst({
          where: { id: line.stockItemId, brandId: existing.brandId },
        });
        if (!item) {
          throw new BadRequestException(
            `Stock item for line ${lineId} was not found.`,
          );
        }

        const currentQty = new Prisma.Decimal(item.qtyOnHand);
        const qtyAfter = currentQty.plus(qty);
        const nextCost = this.inventoryService.weightedAverageCost(
          currentQty,
          item.costPerUnit,
          qty,
          line.unitCost,
        );

        await tx.stockItem.update({
          where: { id: item.id },
          data: {
            qtyOnHand: qtyAfter,
            costPerUnit: nextCost,
          },
        });

        await tx.stockMovement.create({
          data: {
            stockItemId: item.id,
            brandId: existing.brandId,
            type: StockMovementType.RECEIVE,
            deltaQty: qty,
            qtyAfter,
            reason: `PO #${existing.number}`,
            unitCost: line.unitCost,
            receivedAt,
            purchaseOrderId: existing.id,
            createdById: userId ?? null,
          },
        });

        await tx.purchaseOrderLine.update({
          where: { id: lineId },
          data: {
            qtyReceived: line.qtyReceived.plus(qty),
          },
        });
      }

      const refreshedLines = await tx.purchaseOrderLine.findMany({
        where: { purchaseOrderId: id },
      });
      const allReceived = refreshedLines.every((line) =>
        line.qtyReceived.gte(line.qtyOrdered),
      );
      const anyReceived = refreshedLines.some((line) =>
        line.qtyReceived.gt(0),
      );

      let status: PurchaseOrderStatus = existing.status;
      if (allReceived) {
        status = PurchaseOrderStatus.RECEIVED;
      } else if (anyReceived) {
        status = PurchaseOrderStatus.PARTIAL;
      }

      return tx.purchaseOrder.update({
        where: { id },
        data: {
          status,
          receivedAt: allReceived ? receivedAt : existing.receivedAt,
        },
        include: this.poInclude(),
      });
    });

    return this.toPurchaseOrderResponse(updated);
  }

  async buildPdf(id: string, brandSlug?: string): Promise<Buffer> {
    const po = await this.findPurchaseOrder(id, brandSlug);
    const brand = await this.brandsService.resolveBrand(brandSlug);

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(18).text(brand.name, { continued: false });
      doc.moveDown(0.5);
      doc.fontSize(14).text(`Purchase Order #${po.number}`);
      doc.fontSize(10).fillColor('#444');
      doc.text(`Date: ${po.orderedAt.toISOString().slice(0, 10)}`);
      doc.text(`Status: ${po.status}`);
      doc.moveDown();

      doc.fillColor('#000').fontSize(12).text('Supplier');
      doc.fontSize(10).fillColor('#333');
      doc.text(po.supplier.name);
      if (po.supplier.phone) {
        doc.text(`Phone: ${po.supplier.phone}`);
      }
      if (po.supplier.email) {
        doc.text(`Email: ${po.supplier.email}`);
      }
      if (po.supplier.abn) {
        doc.text(`ABN: ${po.supplier.abn}`);
      }
      if (po.supplier.address) {
        doc.text(po.supplier.address);
      }
      doc.moveDown();

      doc.fillColor('#000').fontSize(12).text('Lines');
      doc.moveDown(0.3);

      const startY = doc.y;
      doc.fontSize(9).fillColor('#000');
      doc.text('Item', 50, startY, { width: 200 });
      doc.text('Qty', 260, startY, { width: 60, align: 'right' });
      doc.text('Unit', 330, startY, { width: 50 });
      doc.text('Cost', 390, startY, { width: 70, align: 'right' });
      doc.text('Total', 470, startY, { width: 80, align: 'right' });
      doc
        .moveTo(50, startY + 14)
        .lineTo(550, startY + 14)
        .stroke('#999');

      let y = startY + 20;
      let grandTotal = new Prisma.Decimal(0);

      for (const line of po.lines) {
        const lineTotal = line.qtyOrdered.mul(line.unitCost);
        grandTotal = grandTotal.plus(lineTotal);

        if (y > 720) {
          doc.addPage();
          y = 50;
        }

        doc.fontSize(9).fillColor('#222');
        doc.text(line.stockItem.name, 50, y, { width: 200 });
        doc.text(line.qtyOrdered.toString(), 260, y, {
          width: 60,
          align: 'right',
        });
        doc.text(line.stockItem.unit, 330, y, { width: 50 });
        doc.text(this.formatAud(line.unitCost), 390, y, {
          width: 70,
          align: 'right',
        });
        doc.text(this.formatAud(lineTotal), 470, y, {
          width: 80,
          align: 'right',
        });
        y += 16;
      }

      doc
        .moveTo(50, y + 4)
        .lineTo(550, y + 4)
        .stroke('#999');
      doc.fontSize(11).fillColor('#000');
      doc.text(`Total: ${this.formatAud(grandTotal)}`, 390, y + 12, {
        width: 160,
        align: 'right',
      });

      if (po.notes) {
        doc.moveDown(2);
        doc.fontSize(10).text(`Notes: ${po.notes}`);
      }

      doc.end();
    });
  }

  private async findPurchaseOrder(id: string, brandSlug?: string) {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, brandId },
      include: this.poInclude(),
    });
    if (!po) {
      throw new NotFoundException('Purchase order not found.');
    }
    return po;
  }

  private poInclude() {
    return {
      supplier: true,
      lines: {
        include: {
          stockItem: { select: { id: true, name: true, unit: true } },
        },
        orderBy: { stockItem: { name: 'asc' as const } },
      },
    };
  }

  private async assertPoStockItems(
    brandId: string,
    stockIds: string[],
  ): Promise<void> {
    const unique = [...new Set(stockIds)];
    const items = await this.prisma.stockItem.findMany({
      where: { brandId, id: { in: unique } },
      select: { id: true },
    });
    if (items.length !== unique.length) {
      throw new BadRequestException(
        'One or more stock items are invalid for this store.',
      );
    }
  }

  private parseOptionalDate(
    value: string | null | undefined,
    label: string,
  ): Date | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${label} is invalid.`);
    }
    return date;
  }

  private formatAud(value: Prisma.Decimal): string {
    return `$${Number(value.toString()).toFixed(2)} AUD`;
  }

  private toSupplierResponse(supplier: {
    id: string;
    brandId: string;
    name: string;
    phone: string | null;
    email: string | null;
    abn: string | null;
    address: string | null;
    notes: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): SupplierResponse {
    return {
      id: supplier.id,
      brandId: supplier.brandId,
      name: supplier.name,
      phone: supplier.phone,
      email: supplier.email,
      abn: supplier.abn,
      address: supplier.address,
      notes: supplier.notes,
      isActive: supplier.isActive,
      createdAt: supplier.createdAt,
      updatedAt: supplier.updatedAt,
    };
  }

  private toPurchaseOrderResponse(po: {
    id: string;
    brandId: string;
    number: number;
    status: PurchaseOrderStatus;
    supplierId: string;
    orderedAt: Date;
    expectedAt: Date | null;
    receivedAt: Date | null;
    notes: string | null;
    createdById: string | null;
    createdAt: Date;
    updatedAt: Date;
    supplier: { name: string };
    lines: Array<{
      id: string;
      stockItemId: string;
      qtyOrdered: Prisma.Decimal;
      qtyReceived: Prisma.Decimal;
      unitCost: Prisma.Decimal;
      stockItem: { name: string; unit: string };
    }>;
  }): PurchaseOrderResponse {
    const lines = po.lines.map((line) => {
      const lineTotal = line.qtyOrdered.mul(line.unitCost);
      return {
        id: line.id,
        stockItemId: line.stockItemId,
        stockItemName: line.stockItem.name,
        stockItemUnit: line.stockItem.unit,
        qtyOrdered: line.qtyOrdered.toString(),
        qtyReceived: line.qtyReceived.toString(),
        unitCost: line.unitCost.toString(),
        lineTotal: lineTotal.toDecimalPlaces(2).toString(),
      };
    });
    const total = lines
      .reduce(
        (sum, line) => sum.plus(new Prisma.Decimal(line.lineTotal)),
        new Prisma.Decimal(0),
      )
      .toDecimalPlaces(2)
      .toString();

    return {
      id: po.id,
      brandId: po.brandId,
      number: po.number,
      status: po.status,
      supplierId: po.supplierId,
      supplierName: po.supplier.name,
      orderedAt: po.orderedAt,
      expectedAt: po.expectedAt,
      receivedAt: po.receivedAt,
      notes: po.notes,
      createdById: po.createdById,
      createdAt: po.createdAt,
      updatedAt: po.updatedAt,
      lines,
      total,
    };
  }
}
