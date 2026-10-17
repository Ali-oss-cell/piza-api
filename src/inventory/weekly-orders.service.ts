import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, StockUnit, WeeklyStockOrderStatus } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { BrandsService } from '../brands/brands.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateWeeklyOrderDto,
  SendWeeklyOrderDto,
  UpdateWeeklyOrderDto,
} from './dto/weekly-order.dto';
import {
  WEEKLY_SHEET_CATALOG,
  WEEKLY_SHEET_GUIDE_BASE_PIZZAS,
} from './weekly-sheet-catalog';

const UNIT_LABEL: Record<StockUnit, string> = {
  EACH: 'each',
  KG: 'kg',
  G: 'g',
  L: 'L',
  ML: 'mL',
  CARTON: 'carton',
  PACK: 'pack',
  BAG: 'bag',
  BOX: 'box',
  ROLL: 'roll',
};

export type WeeklyOrderLineResponse = {
  id: string;
  stockItemId: string | null;
  supplierId: string | null;
  supplierName: string | null;
  supplierEmail: string | null;
  category: string;
  name: string;
  unit: StockUnit;
  packSize: string | null;
  guideQty: string | null;
  sheetOrder: number;
  stockOnHand: string | null;
  orderQty: string | null;
  received: boolean;
};

export type WeeklyOrderDispatchResponse = {
  id: string;
  supplierId: string | null;
  supplierName: string;
  emailedTo: string;
  itemCount: number;
  status: string;
  error: string | null;
  sentAt: Date;
};

export type WeeklyOrderSummaryResponse = {
  id: string;
  number: number;
  weekCommencing: string;
  orderedBy: string | null;
  pizzasExpected: number | null;
  supplierDay: string | null;
  status: WeeklyStockOrderStatus;
  sentAt: Date | null;
  lineCount: number;
  orderedLineCount: number;
  createdAt: Date;
};

export type WeeklyOrderResponse = WeeklyOrderSummaryResponse & {
  brandId: string;
  notes: string | null;
  guideBasePizzas: number;
  updatedAt: Date;
  lines: WeeklyOrderLineResponse[];
  dispatches: WeeklyOrderDispatchResponse[];
};

type LineRow = Prisma.WeeklyStockOrderLineGetPayload<{
  include: { supplier: { select: { id: true; name: true; email: true } } };
}>;

type OrderRow = Prisma.WeeklyStockOrderGetPayload<{
  include: {
    lines: {
      include: { supplier: { select: { id: true; name: true; email: true } } };
    };
    dispatches: true;
  };
}>;

@Injectable()
export class WeeklyOrdersService {
  private readonly logger = new Logger(WeeklyOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly brandsService: BrandsService,
    private readonly mailService: MailService,
  ) {}

  /** Idempotently load the standard 65-item sheet catalogue into this store. */
  async seedCatalog(brandSlug?: string): Promise<{
    created: number;
    updated: number;
    total: number;
  }> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    let created = 0;
    let updated = 0;
    let order = 0;

    for (const category of WEEKLY_SHEET_CATALOG) {
      for (const item of category.items) {
        order += 1;
        const guide =
          item.guide === null ? null : new Prisma.Decimal(item.guide);
        const existing = await this.prisma.stockItem.findUnique({
          where: { brandId_name: { brandId, name: item.name } },
        });

        if (existing) {
          // Keep unit/qty/cost as-is; only fill the sheet fields.
          await this.prisma.stockItem.update({
            where: { id: existing.id },
            data: {
              category: category.name,
              packSize: item.packSize,
              guideQty: guide,
              sheetOrder: order,
            },
          });
          updated += 1;
        } else {
          await this.prisma.stockItem.create({
            data: {
              brandId,
              name: item.name,
              category: category.name,
              unit: item.unit,
              packSize: item.packSize,
              guideQty: guide,
              sheetOrder: order,
            },
          });
          created += 1;
        }
      }
    }

    return { created, updated, total: order };
  }

  async list(brandSlug?: string): Promise<WeeklyOrderSummaryResponse[]> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const orders = await this.prisma.weeklyStockOrder.findMany({
      where: { brandId },
      orderBy: [{ weekCommencing: 'desc' }, { number: 'desc' }],
      include: {
        lines: { select: { orderQty: true } },
      },
    });
    return orders.map((order) => ({
      id: order.id,
      number: order.number,
      weekCommencing: this.dateOnly(order.weekCommencing),
      orderedBy: order.orderedBy,
      pizzasExpected: order.pizzasExpected,
      supplierDay: order.supplierDay,
      status: order.status,
      sentAt: order.sentAt,
      lineCount: order.lines.length,
      orderedLineCount: order.lines.filter(
        (l) => l.orderQty && l.orderQty.gt(0),
      ).length,
      createdAt: order.createdAt,
    }));
  }

  async get(id: string, brandSlug?: string): Promise<WeeklyOrderResponse> {
    return this.toResponse(await this.find(id, brandSlug));
  }

  async create(
    dto: CreateWeeklyOrderDto,
    userId: string | undefined,
    brandSlug?: string,
  ): Promise<WeeklyOrderResponse> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const weekCommencing = this.parseDate(dto.weekCommencing);

    let source: OrderRow | null = null;
    if (dto.copyFromOrderId) {
      source = await this.find(dto.copyFromOrderId, brandSlug);
    }

    const items = await this.prisma.stockItem.findMany({
      where: { brandId, isActive: true },
      orderBy: [{ sheetOrder: 'asc' }, { category: 'asc' }, { name: 'asc' }],
    });
    if (items.length === 0) {
      throw new BadRequestException(
        'No stock items yet. Use "Load standard sheet items" first.',
      );
    }

    const sourceByItem = new Map<string, LineRow>();
    for (const line of source?.lines ?? []) {
      if (line.stockItemId) {
        sourceByItem.set(line.stockItemId, line);
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const agg = await tx.weeklyStockOrder.aggregate({
        where: { brandId },
        _max: { number: true },
      });
      const number = (agg._max.number ?? 0) + 1;

      return tx.weeklyStockOrder.create({
        data: {
          brandId,
          number,
          weekCommencing,
          orderedBy: dto.orderedBy?.trim() || source?.orderedBy || null,
          pizzasExpected:
            dto.pizzasExpected !== undefined
              ? dto.pizzasExpected
              : (source?.pizzasExpected ?? null),
          supplierDay: dto.supplierDay?.trim() || source?.supplierDay || null,
          notes: dto.notes?.trim() || null,
          createdById: userId ?? null,
          lines: {
            create: items.map((item) => ({
              stockItemId: item.id,
              supplierId: item.supplierId,
              category: item.category?.trim() || 'Other',
              name: item.name,
              unit: item.unit,
              packSize: item.packSize,
              guideQty: item.guideQty,
              sheetOrder: item.sheetOrder,
              stockOnHand: item.qtyOnHand,
              orderQty: sourceByItem.get(item.id)?.orderQty ?? null,
            })),
          },
        },
        include: this.include(),
      });
    });

    return this.toResponse(created);
  }

  async update(
    id: string,
    dto: UpdateWeeklyOrderDto,
    brandSlug?: string,
  ): Promise<WeeklyOrderResponse> {
    const existing = await this.find(id, brandSlug);
    const brandId = existing.brandId;

    const lineIds = new Set(existing.lines.map((l) => l.id));
    const supplierIds = new Set<string>();
    for (const line of dto.lines ?? []) {
      if (!lineIds.has(line.id)) {
        throw new BadRequestException(`Line ${line.id} is not on this order.`);
      }
      if (line.supplierId) {
        supplierIds.add(line.supplierId);
      }
    }
    if (supplierIds.size > 0) {
      const found = await this.prisma.supplier.findMany({
        where: { brandId, id: { in: [...supplierIds] } },
        select: { id: true },
      });
      if (found.length !== supplierIds.size) {
        throw new BadRequestException('Vendor not found for this store.');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.weeklyStockOrder.update({
        where: { id },
        data: {
          ...(dto.weekCommencing !== undefined
            ? { weekCommencing: this.parseDate(dto.weekCommencing) }
            : {}),
          ...(dto.orderedBy !== undefined
            ? { orderedBy: dto.orderedBy?.trim() || null }
            : {}),
          ...(dto.pizzasExpected !== undefined
            ? { pizzasExpected: dto.pizzasExpected }
            : {}),
          ...(dto.supplierDay !== undefined
            ? { supplierDay: dto.supplierDay?.trim() || null }
            : {}),
          ...(dto.notes !== undefined
            ? { notes: dto.notes?.trim() || null }
            : {}),
        },
      });

      for (const line of dto.lines ?? []) {
        const row = existing.lines.find((l) => l.id === line.id);
        await tx.weeklyStockOrderLine.update({
          where: { id: line.id },
          data: {
            ...(line.stockOnHand !== undefined
              ? {
                  stockOnHand:
                    line.stockOnHand === null
                      ? null
                      : new Prisma.Decimal(line.stockOnHand),
                }
              : {}),
            ...(line.orderQty !== undefined
              ? {
                  orderQty:
                    line.orderQty === null
                      ? null
                      : new Prisma.Decimal(line.orderQty),
                }
              : {}),
            ...(line.received !== undefined ? { received: line.received } : {}),
            ...(line.supplierId !== undefined
              ? { supplierId: line.supplierId }
              : {}),
          },
        });

        if (line.supplierId !== undefined && row?.stockItemId) {
          await tx.stockItem.updateMany({
            where: { id: row.stockItemId, brandId },
            data: { supplierId: line.supplierId },
          });
        }
      }
    });

    return this.get(id, brandSlug);
  }

  async remove(id: string, brandSlug?: string): Promise<{ deleted: true }> {
    const existing = await this.find(id, brandSlug);
    if (existing.status !== WeeklyStockOrderStatus.DRAFT) {
      throw new BadRequestException('Only draft weekly orders can be deleted.');
    }
    await this.prisma.weeklyStockOrder.delete({ where: { id } });
    return { deleted: true };
  }

  /** Per-vendor preview used by the send dialog and by `send`. */
  async preview(id: string, brandSlug?: string) {
    const order = await this.find(id, brandSlug);
    return this.groupByVendor(order);
  }

  async send(
    id: string,
    dto: SendWeeklyOrderDto,
    brandSlug?: string,
  ): Promise<WeeklyOrderResponse & { results: WeeklyOrderDispatchResponse[] }> {
    const order = await this.find(id, brandSlug);
    const brand = await this.brandsService.resolveBrand(brandSlug);
    const groups = this.groupByVendor(order);

    if (groups.items === 0) {
      throw new BadRequestException(
        'Nothing to send — enter an order quantity on at least one item.',
      );
    }

    if (groups.unassigned.length > 0) {
      throw new BadRequestException(
        `Assign a vendor to: ${groups.unassigned.map((l) => l.name).join(', ')}.`,
      );
    }

    const wanted = dto.supplierIds?.length ? new Set(dto.supplierIds) : null;
    const targets = groups.vendors.filter(
      (v) => !wanted || wanted.has(v.supplierId),
    );
    if (targets.length === 0) {
      throw new BadRequestException('No matching vendors to send to.');
    }

    const missingEmail = targets.filter((v) => !v.email);
    if (missingEmail.length > 0) {
      throw new BadRequestException(
        `Add an email address for: ${missingEmail.map((v) => v.supplierName).join(', ')} (Suppliers tab).`,
      );
    }

    if (!(await this.mailService.isConfiguredFor(brand.id))) {
      throw new BadRequestException(
        'Email is not configured for this store. Add SMTP settings in Infrastructure → Email.',
      );
    }

    const location = await this.prisma.location.findFirst({
      where: { brandId: brand.id, isActive: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      select: { email: true },
    });
    const replyTo = location?.email?.trim() || undefined;

    const results: WeeklyOrderDispatchResponse[] = [];
    let anySent = false;

    for (const vendor of targets) {
      const pdf = await this.renderPdf(order, brand.name, {
        blank: false,
        supplierId: vendor.supplierId,
      });
      const week = this.dateOnly(order.weekCommencing);
      const subject = `${brand.name} — Weekly stock order — week commencing ${week}`;
      const lineText = vendor.lines
        .map(
          (l) =>
            `• ${l.name}: ${this.fmtQty(l.orderQty)} ${UNIT_LABEL[l.unit]}${
              l.packSize ? ` (${l.packSize})` : ''
            }`,
        )
        .join('\n');
      const text = [
        `Hello ${vendor.supplierName},`,
        '',
        `Please find our weekly stock order for the week commencing ${week} below (PDF attached).`,
        order.supplierDay ? `Delivery / supplier day: ${order.supplierDay}` : null,
        order.orderedBy ? `Ordered by: ${order.orderedBy}` : null,
        '',
        lineText,
        order.notes ? `\nNotes: ${order.notes}` : null,
        '',
        `Thanks,\n${brand.name}`,
      ]
        .filter((l) => l !== null)
        .join('\n');

      const rows = vendor.lines
        .map(
          (l) =>
            `<tr><td style="padding:4px 12px 4px 0">${esc(l.name)}</td><td style="padding:4px 12px">${esc(
              this.fmtQty(l.orderQty),
            )} ${esc(UNIT_LABEL[l.unit])}</td><td style="padding:4px 0 4px 12px;color:#666">${esc(
              l.packSize ?? '',
            )}</td></tr>`,
        )
        .join('');
      const html = `<p>Hello ${esc(vendor.supplierName)},</p>
        <p>Please find our weekly stock order for the week commencing <strong>${esc(week)}</strong> below (PDF attached).</p>
        ${order.supplierDay ? `<p>Delivery / supplier day: ${esc(order.supplierDay)}</p>` : ''}
        ${order.orderedBy ? `<p>Ordered by: ${esc(order.orderedBy)}</p>` : ''}
        <table style="border-collapse:collapse;font-size:14px"><thead><tr><th align="left" style="padding:4px 12px 4px 0">Item</th><th align="left" style="padding:4px 12px">Order qty</th><th align="left" style="padding:4px 0 4px 12px">Pack size</th></tr></thead><tbody>${rows}</tbody></table>
        ${order.notes ? `<p>Notes: ${esc(order.notes)}</p>` : ''}
        <p>Thanks,<br>${esc(brand.name)}</p>`;

      let status = 'SENT';
      let error: string | null = null;
      try {
        await this.mailService.send(
          {
            to: vendor.email as string,
            subject,
            text,
            html,
            replyTo,
            attachments: [
              {
                filename: `weekly-order-${order.number}-${vendor.supplierName
                  .replace(/[^a-z0-9]+/gi, '-')
                  .toLowerCase()}.pdf`,
                content: pdf,
                contentType: 'application/pdf',
              },
            ],
          },
          brand.id,
        );
        anySent = true;
      } catch (sendError) {
        status = 'FAILED';
        error =
          sendError instanceof Error
            ? sendError.message.slice(0, 500)
            : String(sendError);
        this.logger.error(
          `Weekly order ${order.number} to ${vendor.supplierName} failed: ${error}`,
        );
      }

      const dispatch = await this.prisma.weeklyStockOrderDispatch.create({
        data: {
          orderId: order.id,
          supplierId: vendor.supplierId,
          supplierName: vendor.supplierName,
          emailedTo: vendor.email as string,
          itemCount: vendor.lines.length,
          status,
          error,
        },
      });
      results.push(this.toDispatch(dispatch));
    }

    if (anySent) {
      await this.prisma.weeklyStockOrder.update({
        where: { id: order.id },
        data: { status: WeeklyStockOrderStatus.SENT, sentAt: new Date() },
      });
    }

    return { ...(await this.get(id, brandSlug)), results };
  }

  async buildPdf(
    id: string,
    options: { blank?: boolean; supplierId?: string },
    brandSlug?: string,
  ): Promise<Buffer> {
    const order = await this.find(id, brandSlug);
    const brand = await this.brandsService.resolveBrand(brandSlug);
    return this.renderPdf(order, brand.name, {
      blank: Boolean(options.blank),
      supplierId: options.supplierId,
    });
  }

  /* ───────────────────────────── internals ───────────────────────────── */

  private groupByVendor(order: OrderRow) {
    const ordered = order.lines.filter((l) => l.orderQty && l.orderQty.gt(0));
    const unassigned = ordered.filter((l) => !l.supplierId);
    const byVendor = new Map<
      string,
      {
        supplierId: string;
        supplierName: string;
        email: string | null;
        lines: LineRow[];
      }
    >();
    for (const line of ordered) {
      if (!line.supplierId || !line.supplier) {
        continue;
      }
      const entry = byVendor.get(line.supplierId) ?? {
        supplierId: line.supplierId,
        supplierName: line.supplier.name,
        email: line.supplier.email?.trim() || null,
        lines: [],
      };
      entry.lines.push(line);
      byVendor.set(line.supplierId, entry);
    }
    return {
      items: ordered.length,
      unassigned: unassigned.map((l) => ({ id: l.id, name: l.name })),
      vendors: [...byVendor.values()].sort((a, b) =>
        a.supplierName.localeCompare(b.supplierName),
      ),
    };
  }

  private include() {
    return {
      lines: {
        include: {
          supplier: { select: { id: true, name: true, email: true } },
        },
        orderBy: [
          { sheetOrder: 'asc' as const },
          { category: 'asc' as const },
          { name: 'asc' as const },
        ],
      },
      dispatches: { orderBy: { sentAt: 'desc' as const } },
    };
  }

  private async find(id: string, brandSlug?: string): Promise<OrderRow> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const order = await this.prisma.weeklyStockOrder.findFirst({
      where: { id, brandId },
      include: this.include(),
    });
    if (!order) {
      throw new NotFoundException('Weekly order not found.');
    }
    return order;
  }

  private parseDate(value: string): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Week commencing date is invalid.');
    }
    return new Date(date.toISOString().slice(0, 10) + 'T00:00:00.000Z');
  }

  private dateOnly(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private fmtQty(value: Prisma.Decimal | null | undefined): string {
    if (value === null || value === undefined) {
      return '';
    }
    return String(Number(value.toString()));
  }

  private toDispatch(d: {
    id: string;
    supplierId: string | null;
    supplierName: string;
    emailedTo: string;
    itemCount: number;
    status: string;
    error: string | null;
    sentAt: Date;
  }): WeeklyOrderDispatchResponse {
    return {
      id: d.id,
      supplierId: d.supplierId,
      supplierName: d.supplierName,
      emailedTo: d.emailedTo,
      itemCount: d.itemCount,
      status: d.status,
      error: d.error,
      sentAt: d.sentAt,
    };
  }

  private toResponse(order: OrderRow): WeeklyOrderResponse {
    return {
      id: order.id,
      brandId: order.brandId,
      number: order.number,
      weekCommencing: this.dateOnly(order.weekCommencing),
      orderedBy: order.orderedBy,
      pizzasExpected: order.pizzasExpected,
      supplierDay: order.supplierDay,
      status: order.status,
      notes: order.notes,
      sentAt: order.sentAt,
      guideBasePizzas: WEEKLY_SHEET_GUIDE_BASE_PIZZAS,
      lineCount: order.lines.length,
      orderedLineCount: order.lines.filter(
        (l) => l.orderQty && l.orderQty.gt(0),
      ).length,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      lines: order.lines.map((l) => ({
        id: l.id,
        stockItemId: l.stockItemId,
        supplierId: l.supplierId,
        supplierName: l.supplier?.name ?? null,
        supplierEmail: l.supplier?.email ?? null,
        category: l.category,
        name: l.name,
        unit: l.unit,
        packSize: l.packSize,
        guideQty: l.guideQty?.toString() ?? null,
        sheetOrder: l.sheetOrder,
        stockOnHand: l.stockOnHand?.toString() ?? null,
        orderQty: l.orderQty?.toString() ?? null,
        received: l.received,
      })),
      dispatches: order.dispatches.map((d) => this.toDispatch(d)),
    };
  }

  /** Groups lines by category in sheet order. */
  private groupCategories(lines: LineRow[]): Array<{ name: string; lines: LineRow[] }> {
    const sorted = [...lines].sort((a, b) => {
      const aa = a.sheetOrder > 0 ? 0 : 1;
      const bb = b.sheetOrder > 0 ? 0 : 1;
      if (aa !== bb) return aa - bb;
      if (a.sheetOrder !== b.sheetOrder) return a.sheetOrder - b.sheetOrder;
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return a.name.localeCompare(b.name);
    });
    const groups: Array<{ name: string; lines: LineRow[] }> = [];
    for (const line of sorted) {
      let group = groups.find((g) => g.name === line.category);
      if (!group) {
        group = { name: line.category, lines: [] };
        groups.push(group);
      }
      group.lines.push(line);
    }
    return groups;
  }

  private guideText(line: LineRow): string {
    if (line.guideQty === null) {
      return '-';
    }
    const num = String(Number(line.guideQty.toString()));
    return line.unit === StockUnit.EACH
      ? `${num} each`
      : `~${num} ${UNIT_LABEL[line.unit]}`;
  }

  private renderPdf(
    order: OrderRow,
    brandName: string,
    options: { blank: boolean; supplierId?: string },
  ): Promise<Buffer> {
    const vendorMode = Boolean(options.supplierId);
    let lines = order.lines;
    let vendorName: string | null = null;
    if (vendorMode) {
      lines = lines.filter(
        (l) => l.supplierId === options.supplierId && l.orderQty && l.orderQty.gt(0),
      );
      vendorName =
        lines[0]?.supplier?.name ?? order.dispatches[0]?.supplierName ?? null;
    }
    const categories = this.groupCategories(lines);
    const catalogNotes = new Map(
      WEEKLY_SHEET_CATALOG.filter((c) => c.note).map((c) => [c.name, c.note]),
    );

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 56, bottom: 48, left: 40, right: 40 },
        bufferPages: true,
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const left = doc.page.margins.left;
      const right = doc.page.width - doc.page.margins.right;
      const width = right - left;
      const bottom = doc.page.height - doc.page.margins.bottom;

      // Column layout (staff sheet) vs vendor order.
      const cols = vendorMode
        ? [
            { key: 'item', label: 'Item', w: width - 270 },
            { key: 'unit', label: 'Unit', w: 60 },
            { key: 'pack', label: 'Pack size', w: 110 },
            { key: 'qty', label: 'Order qty', w: 100 },
          ]
        : [
            { key: 'item', label: 'Item', w: width - 337 },
            { key: 'unit', label: 'Unit', w: 38 },
            { key: 'pack', label: 'Pack size', w: 80 },
            { key: 'guide', label: 'Guide', w: 62 },
            { key: 'soh', label: 'Stock on hand', w: 58 },
            { key: 'qty', label: 'Order qty', w: 57 },
            { key: 'rec', label: "Rec'd", w: 42 },
          ];

      const title = vendorMode
        ? `${brandName} - Weekly Stock Order${vendorName ? ` for ${vendorName}` : ''}`
        : `${brandName} - Weekly Stock Order Sheet${options.blank ? ' (Print)' : ''}`;
      doc.font('Helvetica-Bold').fontSize(15).fillColor('#000').text(title, left, doc.y);
      doc.moveDown(0.3);

      if (!vendorMode) {
        doc
          .font('Helvetica')
          .fontSize(8.5)
          .fillColor('#444')
          .text(
            options.blank
              ? "For staff to fill in by hand. Count stock on hand, write the order quantity, tick when received. 'Guide' is the suggested order at about 500 pizzas a week - adjust up or down for a busier or quieter week."
              : "Staff copy. 'Guide' is the suggested order at about 500 pizzas a week - adjust up or down for a busier or quieter week.",
            left,
            doc.y,
            { width },
          );
        doc.moveDown(0.6);
      }

      // Header fields
      const week = this.dateOnly(order.weekCommencing);
      const fields: Array<[string, string]> = [
        ['Week commencing', options.blank ? '' : week],
        ['Ordered by', options.blank ? '' : (order.orderedBy ?? '')],
        [
          'Pizzas expected',
          options.blank ? '' : order.pizzasExpected != null ? String(order.pizzasExpected) : '',
        ],
        ['Supplier day', options.blank ? '' : (order.supplierDay ?? '')],
      ];
      const fieldW = width / fields.length;
      const fieldY = doc.y;
      doc.fontSize(9).fillColor('#000');
      fields.forEach(([label, value], idx) => {
        const x = left + idx * fieldW;
        doc.font('Helvetica-Bold').text(`${label}:`, x, fieldY, { width: fieldW - 8 });
        doc
          .font('Helvetica')
          .text(value, x, fieldY + 12, { width: fieldW - 8 });
        doc
          .moveTo(x, fieldY + 24)
          .lineTo(x + fieldW - 10, fieldY + 24)
          .lineWidth(0.5)
          .stroke('#999');
      });
      doc.y = fieldY + 34;

      const rowPad = 3;
      const drawHeaderRow = () => {
        const y = doc.y;
        let x = left;
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#000');
        doc.rect(left, y - 2, width, 15).fill('#f1f1f1');
        doc.fillColor('#000');
        for (const col of cols) {
          doc.text(col.label, x + 3, y + 1, {
            width: col.w - 6,
            lineBreak: false,
            align: col.key === 'qty' || col.key === 'soh' || col.key === 'guide' ? 'right' : 'left',
          });
          x += col.w;
        }
        doc.y = y + 15;
      };

      for (const category of categories) {
        // Keep heading + header + first row together.
        if (doc.y + 70 > bottom) {
          doc.addPage();
        }
        const note = catalogNotes.get(category.name);
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#d81b60');
        doc.text(
          note && !vendorMode ? `${category.name} (${note})` : category.name,
          left,
          doc.y + 4,
          { width },
        );
        doc.moveDown(0.25);
        drawHeaderRow();

        for (const line of category.lines) {
          doc.font('Helvetica').fontSize(8.5);
          const itemCol = cols[0];
          const nameH = doc.heightOfString(line.name, { width: itemCol.w - 6 });
          const rowH = Math.max(nameH, 11) + rowPad * 2;

          if (doc.y + rowH > bottom) {
            doc.addPage();
            doc.font('Helvetica-Bold').fontSize(9).fillColor('#d81b60');
            doc.text(`${category.name} (continued)`, left, doc.y, { width });
            doc.moveDown(0.25);
            drawHeaderRow();
            doc.font('Helvetica').fontSize(8.5);
          }

          const y = doc.y;
          let x = left;
          doc.fillColor('#000');
          for (const col of cols) {
            let value = '';
            let align: 'left' | 'right' | 'center' = 'left';
            switch (col.key) {
              case 'item':
                value = line.name;
                break;
              case 'unit':
                value = UNIT_LABEL[line.unit];
                break;
              case 'pack':
                value = line.packSize ?? '-';
                break;
              case 'guide':
                value = this.guideText(line);
                align = 'right';
                break;
              case 'soh':
                value = options.blank ? '' : this.fmtQty(line.stockOnHand);
                align = 'right';
                break;
              case 'qty':
                value = options.blank ? '' : this.fmtQty(line.orderQty);
                align = 'right';
                break;
              case 'rec':
                value = line.received && !options.blank ? '[x]' : '[ ]';
                align = 'center';
                break;
            }
            doc.text(value, x + 3, y + rowPad, {
              width: col.w - 6,
              align,
              lineBreak: col.key === 'item',
            });
            x += col.w;
          }
          doc
            .moveTo(left, y + rowH)
            .lineTo(right, y + rowH)
            .lineWidth(0.3)
            .stroke('#ccc');
          doc.y = y + rowH;
        }
        doc.moveDown(0.3);
      }

      if (vendorMode) {
        if (order.supplierDay) {
          doc.moveDown(0.5).font('Helvetica').fontSize(9).fillColor('#000');
          doc.text(`Supplier day: ${order.supplierDay}`, left, doc.y, { width });
        }
        if (order.notes) {
          doc.font('Helvetica').fontSize(9).fillColor('#000');
          doc.text(`Notes: ${order.notes}`, left, doc.y + 2, { width });
        }
      }

      // Running header with page numbers on every page.
      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i += 1) {
        doc.switchToPage(range.start + i);
        doc.font('Helvetica').fontSize(8).fillColor('#666');
        doc.text(
          `${brandName} - Weekly stock order sheet`,
          left,
          24,
          { width: width / 2, lineBreak: false },
        );
        doc.text(`Page ${i + 1} of ${range.count}`, left + width / 2, 24, {
          width: width / 2,
          align: 'right',
          lineBreak: false,
        });
      }

      doc.end();
    });
  }
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
