import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerSegmentDto } from './dto/create-customer-segment.dto';
import { CreateCustomerTagDto } from './dto/create-customer-tag.dto';
import { UpdateCustomerSegmentDto } from './dto/update-customer-segment.dto';
import { UpdateStoreCustomerDto } from './dto/update-store-customer.dto';

export type SegmentRules = {
  minOrders?: number;
  minSpend?: number;
  lastOrderWithinDays?: number;
  lastOrderBeforeDays?: number;
  hasTags?: string[];
  missingTags?: string[];
  marketingEmailOptIn?: boolean;
  marketingSmsOptIn?: boolean;
};

@Injectable()
export class CrmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  normalizePhone(raw?: string | null): string | null {
    if (!raw?.trim()) return null;
    let digits = raw.replace(/\D/g, '');
    if (!digits) return null;
    if (digits.startsWith('0') && digits.length === 10) {
      digits = `61${digits.slice(1)}`;
    } else if (digits.startsWith('61') && digits.length === 11) {
      // already E.164-ish without +
    } else if (digits.length === 9 && digits.startsWith('4')) {
      digits = `61${digits}`;
    }
    return digits;
  }

  normalizeEmail(raw?: string | null): string | null {
    const value = raw?.trim().toLowerCase();
    return value || null;
  }

  buildIdentityKey(phone?: string | null, email?: string | null): string | null {
    const phoneNormalized = this.normalizePhone(phone);
    if (phoneNormalized) return `phone:${phoneNormalized}`;
    const emailNormalized = this.normalizeEmail(email);
    if (emailNormalized) return `email:${emailNormalized}`;
    return null;
  }

  private async resolveBrandId(brandSlug: string): Promise<{ id: string; slug: string; name: string }> {
    const slug = brandSlug.trim().toLowerCase();
    const brand = await this.prisma.brand.findUnique({
      where: { slug },
      select: { id: true, slug: true, name: true },
    });
    if (!brand) {
      throw new NotFoundException(`Store "${slug}" not found.`);
    }
    return brand;
  }

  async upsertFromOrderContact(input: {
    brandId: string;
    orderId: string;
    phone?: string | null;
    email?: string | null;
    name?: string | null;
  }): Promise<string | null> {
    const identityKey = this.buildIdentityKey(input.phone, input.email);
    if (!identityKey) {
      return null;
    }

    const phoneNormalized = this.normalizePhone(input.phone);
    const emailNormalized = this.normalizeEmail(input.email);
    const name = input.name?.trim() || null;

    const customer = await this.prisma.storeCustomer.upsert({
      where: {
        brandId_identityKey: {
          brandId: input.brandId,
          identityKey,
        },
      },
      create: {
        brandId: input.brandId,
        identityKey,
        phone: input.phone?.trim() || null,
        phoneNormalized,
        email: input.email?.trim() || null,
        emailNormalized,
        name,
      },
      update: {
        ...(input.phone?.trim()
          ? { phone: input.phone.trim(), phoneNormalized }
          : {}),
        ...(input.email?.trim()
          ? { email: input.email.trim(), emailNormalized }
          : {}),
        ...(name ? { name } : {}),
      },
    });

    await this.prisma.order.update({
      where: { id: input.orderId },
      data: { storeCustomerId: customer.id },
    });

    await this.recalculateCustomerStats(customer.id);
    return customer.id;
  }

  async linkOrderById(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        location: { select: { brandId: true } },
        user: { select: { email: true, firstName: true, lastName: true } },
      },
    });
    if (!order) return;

    const email = order.guestEmail || order.user?.email || null;
    const name =
      order.guestName ||
      (order.user
        ? `${order.user.firstName} ${order.user.lastName}`.trim()
        : null);

    await this.upsertFromOrderContact({
      brandId: order.location.brandId,
      orderId: order.id,
      phone: order.guestPhone,
      email,
      name,
    });
  }

  async recalculateCustomerStats(customerId: string): Promise<void> {
    const paid = await this.prisma.order.findMany({
      where: {
        storeCustomerId: customerId,
        paymentStatus: PaymentStatus.PAID,
      },
      select: { total: true, paidAt: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    let totalSpent = new Prisma.Decimal(0);
    for (const order of paid) {
      totalSpent = totalSpent.add(order.total);
    }

    const first = paid[0];
    const last = paid[paid.length - 1];

    await this.prisma.storeCustomer.update({
      where: { id: customerId },
      data: {
        orderCount: paid.length,
        totalSpent,
        firstOrderAt: first ? first.paidAt ?? first.createdAt : null,
        lastOrderAt: last ? last.paidAt ?? last.createdAt : null,
      },
    });
  }

  async backfillBrand(brandSlug: string): Promise<{ customers: number; linkedOrders: number }> {
    const brand = await this.resolveBrandId(brandSlug);
    const orders = await this.prisma.order.findMany({
      where: { location: { brandId: brand.id } },
      include: {
        user: { select: { email: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    let linkedOrders = 0;
    const touched = new Set<string>();

    for (const order of orders) {
      const email = order.guestEmail || order.user?.email || null;
      const name =
        order.guestName ||
        (order.user
          ? `${order.user.firstName} ${order.user.lastName}`.trim()
          : null);
      const id = await this.upsertFromOrderContact({
        brandId: brand.id,
        orderId: order.id,
        phone: order.guestPhone,
        email,
        name,
      });
      if (id) {
        linkedOrders += 1;
        touched.add(id);
      }
    }

    for (const customerId of touched) {
      await this.recalculateCustomerStats(customerId);
    }

    return { customers: touched.size, linkedOrders };
  }

  async backfillAll(): Promise<Array<{ brand: string; customers: number; linkedOrders: number }>> {
    const brands = await this.prisma.brand.findMany({
      select: { slug: true },
      orderBy: { name: 'asc' },
    });
    const results: Array<{ brand: string; customers: number; linkedOrders: number }> = [];
    for (const brand of brands) {
      const result = await this.backfillBrand(brand.slug);
      results.push({ brand: brand.slug, ...result });
    }
    return results;
  }

  private customerInclude() {
    return {
      tags: {
        include: {
          tag: true,
        },
      },
    } as const;
  }

  private mapCustomer<T extends { tags: Array<{ tag: { id: string; slug: string; label: string; color: string | null } }> }>(
    customer: T,
  ) {
    return {
      ...customer,
      tags: customer.tags.map((row) => row.tag),
    };
  }

  async listCustomers(params: {
    brandSlug: string;
    q?: string;
    tag?: string;
    segmentId?: string;
    take?: number;
    skip?: number;
  }) {
    const brand = await this.resolveBrandId(params.brandSlug);
    const take = Math.min(params.take ?? 100, 500);
    const skip = params.skip ?? 0;

    let where: Prisma.StoreCustomerWhereInput = { brandId: brand.id };

    if (params.q?.trim()) {
      const term = params.q.trim();
      where = {
        ...where,
        OR: [
          { name: { contains: term, mode: 'insensitive' } },
          { email: { contains: term, mode: 'insensitive' } },
          { phone: { contains: term, mode: 'insensitive' } },
          { phoneNormalized: { contains: term.replace(/\D/g, '') } },
        ],
      };
    }

    if (params.tag?.trim()) {
      where = {
        ...where,
        tags: {
          some: {
            tag: {
              brandId: brand.id,
              OR: [
                { slug: params.tag.trim().toLowerCase() },
                { id: params.tag.trim() },
              ],
            },
          },
        },
      };
    }

    if (params.segmentId) {
      const segment = await this.prisma.customerSegment.findFirst({
        where: { id: params.segmentId, brandId: brand.id },
      });
      if (!segment) {
        throw new NotFoundException('Segment not found.');
      }
      where = {
        AND: [where, this.segmentRulesToWhere(segment.rules as SegmentRules)],
      };
    }

    const [total, rows] = await Promise.all([
      this.prisma.storeCustomer.count({ where }),
      this.prisma.storeCustomer.findMany({
        where,
        include: this.customerInclude(),
        orderBy: [{ lastOrderAt: 'desc' }, { createdAt: 'desc' }],
        take,
        skip,
      }),
    ]);

    return {
      brand,
      total,
      customers: rows.map((row) => this.mapCustomer(row)),
    };
  }

  private segmentRulesToWhere(rules: SegmentRules): Prisma.StoreCustomerWhereInput {
    const where: Prisma.StoreCustomerWhereInput = {};

    if (typeof rules.minOrders === 'number') {
      where.orderCount = { gte: rules.minOrders };
    }
    if (typeof rules.minSpend === 'number') {
      where.totalSpent = { gte: rules.minSpend };
    }
    if (typeof rules.marketingEmailOptIn === 'boolean') {
      where.marketingEmailOptIn = rules.marketingEmailOptIn;
    }
    if (typeof rules.marketingSmsOptIn === 'boolean') {
      where.marketingSmsOptIn = rules.marketingSmsOptIn;
    }
    if (typeof rules.lastOrderWithinDays === 'number') {
      const since = new Date();
      since.setDate(since.getDate() - rules.lastOrderWithinDays);
      where.lastOrderAt = { ...(where.lastOrderAt as object), gte: since };
    }
    if (typeof rules.lastOrderBeforeDays === 'number') {
      const before = new Date();
      before.setDate(before.getDate() - rules.lastOrderBeforeDays);
      where.lastOrderAt = {
        ...(typeof where.lastOrderAt === 'object' && where.lastOrderAt
          ? where.lastOrderAt
          : {}),
        lte: before,
      };
    }
    if (rules.hasTags?.length) {
      where.AND = [
        ...((where.AND as Prisma.StoreCustomerWhereInput[]) ?? []),
        ...rules.hasTags.map((slug) => ({
          tags: { some: { tag: { slug: slug.toLowerCase() } } },
        })),
      ];
    }
    if (rules.missingTags?.length) {
      where.AND = [
        ...((where.AND as Prisma.StoreCustomerWhereInput[]) ?? []),
        ...rules.missingTags.map((slug) => ({
          tags: { none: { tag: { slug: slug.toLowerCase() } } },
        })),
      ];
    }

    return where;
  }

  async getCustomer(id: string) {
    const customer = await this.prisma.storeCustomer.findUnique({
      where: { id },
      include: {
        ...this.customerInclude(),
        brand: { select: { id: true, slug: true, name: true } },
      },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }

    const orders = await this.prisma.order.findMany({
      where: { storeCustomerId: id },
      include: {
        location: { select: { id: true, name: true } },
        items: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return {
      ...this.mapCustomer(customer),
      orders,
    };
  }

  async updateCustomer(
    id: string,
    dto: UpdateStoreCustomerDto,
    actor: AuthenticatedUser,
  ) {
    const existing = await this.prisma.storeCustomer.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Customer not found.');
    }

    const consentTouched =
      dto.marketingEmailOptIn !== undefined ||
      dto.marketingSmsOptIn !== undefined;

    const updated = await this.prisma.storeCustomer.update({
      where: { id },
      data: {
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.marketingEmailOptIn !== undefined
          ? { marketingEmailOptIn: dto.marketingEmailOptIn }
          : {}),
        ...(dto.marketingSmsOptIn !== undefined
          ? { marketingSmsOptIn: dto.marketingSmsOptIn }
          : {}),
        ...(consentTouched ? { consentUpdatedAt: new Date() } : {}),
      },
      include: this.customerInclude(),
    });

    if (dto.tagIds) {
      await this.setCustomerTags(id, existing.brandId, dto.tagIds);
    }

    await this.auditService.log(
      actor.id,
      existing.brandId,
      AuditAction.CRM_CUSTOMER_UPDATED,
      `CRM customer ${id} updated`,
      { ...dto },
    );

    const refreshed = await this.prisma.storeCustomer.findUnique({
      where: { id },
      include: this.customerInclude(),
    });
    return this.mapCustomer(refreshed ?? updated);
  }

  async listTags(brandSlug: string) {
    const brand = await this.resolveBrandId(brandSlug);
    return this.prisma.customerTag.findMany({
      where: { brandId: brand.id },
      orderBy: { label: 'asc' },
    });
  }

  async createTag(brandSlug: string, dto: CreateCustomerTagDto) {
    const brand = await this.resolveBrandId(brandSlug);
    const slug =
      dto.slug?.trim().toLowerCase() ||
      dto.label
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

    if (!slug) {
      throw new BadRequestException('Tag slug is required.');
    }

    return this.prisma.customerTag.create({
      data: {
        brandId: brand.id,
        slug,
        label: dto.label.trim(),
        color: dto.color?.trim() || '#d81b60',
      },
    });
  }

  async deleteTag(tagId: string) {
    await this.prisma.customerTag.delete({ where: { id: tagId } });
    return { deleted: true };
  }

  async setCustomerTags(customerId: string, brandId: string, tagIds: string[]) {
    const uniqueIds = [...new Set(tagIds)];
    if (uniqueIds.length > 0) {
      const tags = await this.prisma.customerTag.findMany({
        where: { id: { in: uniqueIds }, brandId },
      });
      if (tags.length !== uniqueIds.length) {
        throw new BadRequestException('One or more tags are invalid for this store.');
      }
    }

    await this.prisma.$transaction([
      this.prisma.storeCustomerTag.deleteMany({ where: { customerId } }),
      ...(uniqueIds.length
        ? [
            this.prisma.storeCustomerTag.createMany({
              data: uniqueIds.map((tagId) => ({ customerId, tagId })),
            }),
          ]
        : []),
    ]);
  }

  async listSegments(brandSlug: string) {
    const brand = await this.resolveBrandId(brandSlug);
    const segments = await this.prisma.customerSegment.findMany({
      where: { brandId: brand.id },
      orderBy: { name: 'asc' },
    });

    const withCounts = await Promise.all(
      segments.map(async (segment) => {
        const memberCount = await this.prisma.storeCustomer.count({
          where: {
            brandId: brand.id,
            ...this.segmentRulesToWhere(segment.rules as SegmentRules),
          },
        });
        return { ...segment, memberCount };
      }),
    );

    return withCounts;
  }

  async createSegment(
    brandSlug: string,
    dto: CreateCustomerSegmentDto,
    actor: AuthenticatedUser,
  ) {
    const brand = await this.resolveBrandId(brandSlug);
    return this.prisma.customerSegment.create({
      data: {
        brandId: brand.id,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        rules: dto.rules as Prisma.InputJsonValue,
        createdByUserId: actor.id,
      },
    });
  }

  async updateSegment(id: string, dto: UpdateCustomerSegmentDto) {
    const existing = await this.prisma.customerSegment.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Segment not found.');
    }

    return this.prisma.customerSegment.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.rules !== undefined
          ? { rules: dto.rules as Prisma.InputJsonValue }
          : {}),
      },
    });
  }

  async deleteSegment(id: string) {
    await this.prisma.customerSegment.delete({ where: { id } });
    return { deleted: true };
  }

  async listSegmentMembers(segmentId: string, take = 100, skip = 0) {
    const segment = await this.prisma.customerSegment.findUnique({
      where: { id: segmentId },
      include: { brand: { select: { id: true, slug: true, name: true } } },
    });
    if (!segment) {
      throw new NotFoundException('Segment not found.');
    }

    const where: Prisma.StoreCustomerWhereInput = {
      brandId: segment.brandId,
      ...this.segmentRulesToWhere(segment.rules as SegmentRules),
    };

    const [total, rows] = await Promise.all([
      this.prisma.storeCustomer.count({ where }),
      this.prisma.storeCustomer.findMany({
        where,
        include: this.customerInclude(),
        orderBy: [{ lastOrderAt: 'desc' }, { createdAt: 'desc' }],
        take: Math.min(take, 500),
        skip,
      }),
    ]);

    return {
      segment,
      total,
      customers: rows.map((row) => this.mapCustomer(row)),
    };
  }

  async exportCsv(
    params: {
      brandSlug: string;
      q?: string;
      tag?: string;
      segmentId?: string;
    },
    actor: AuthenticatedUser,
  ): Promise<string> {
    const result = await this.listCustomers({
      ...params,
      take: 5000,
      skip: 0,
    });

    const header =
      'name,phone,email,order_count,total_spent,last_order_at,tags,marketing_email_opt_in,marketing_sms_opt_in';
    const rows = result.customers.map((customer) => {
      const tags = (customer.tags as Array<{ label: string }>)
        .map((tag) => tag.label)
        .join('|');
      return [
        this.csvEscape(customer.name),
        this.csvEscape(customer.phone),
        this.csvEscape(customer.email),
        String(customer.orderCount),
        Number(customer.totalSpent).toFixed(2),
        customer.lastOrderAt
          ? new Date(customer.lastOrderAt).toISOString()
          : '',
        this.csvEscape(tags),
        customer.marketingEmailOptIn ? 'true' : 'false',
        customer.marketingSmsOptIn ? 'true' : 'false',
      ].join(',');
    });

    await this.auditService.log(
      actor.id,
      result.brand.id,
      AuditAction.CRM_EXPORT,
      `Exported ${result.customers.length} CRM customer(s) for ${result.brand.slug}`,
      {
        count: result.customers.length,
        q: params.q ?? null,
        tag: params.tag ?? null,
        segmentId: params.segmentId ?? null,
      },
    );

    return [header, ...rows].join('\n');
  }

  private csvEscape(value: string | null | undefined): string {
    const text = value ?? '';
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }
}
