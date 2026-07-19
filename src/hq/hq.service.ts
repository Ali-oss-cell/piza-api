import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  DealDiscountType,
  DealScope,
  OrderStatus,
  PaymentStatus,
  Prisma,
  StoreMembershipRole,
} from '@prisma/client';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { StoreAccessService } from '../common/services/store-access.service';
import {
  MELBOURNE_TZ,
  melbourneDayBounds,
  melbourneDayKey,
  parseMelbourneDay,
  parseMelbourneDayEnd,
} from '../common/utils/melbourne-time';
import { PrismaService } from '../prisma/prisma.service';
import { ApplyMenuTemplateDto } from './dto/apply-menu-template.dto';
import { CreateDomainDto } from './dto/create-domain.dto';
import { CreateMenuTemplateDto } from './dto/create-menu-template.dto';
import { PushDealDto } from './dto/push-deal.dto';
import { TransferMenuDto } from './dto/transfer-menu.dto';
import { UpdateDomainDto } from './dto/update-domain.dto';

const LIVE_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
  OrderStatus.PREPARING,
  OrderStatus.READY,
  OrderStatus.OUT_FOR_DELIVERY,
];

type OverviewRange = { from: Date; to: Date };

type MenuTemplateSnapshotCategory = {
  slug: string;
  label: string;
  sortOrder: number;
  supportsSizeOptions: boolean;
  supportsExtras: boolean;
  isActive: boolean;
};

type MenuTemplateSnapshotItem = {
  slug: string;
  number: number;
  name: string;
  description: string;
  price: string;
  categorySlug: string;
  imageUrl: string;
  imageAlt: string;
  badges: string[];
  priceNote: string | null;
  ingredients: string[];
  sizeOptions: unknown;
  sizePricing: unknown;
  allowedToppingIds: string[];
  isActive: boolean;
};

type MenuTemplateSnapshot = {
  categories: MenuTemplateSnapshotCategory[];
  items: MenuTemplateSnapshotItem[];
  lockItems?: boolean;
};

@Injectable()
export class HqService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storeAccess: StoreAccessService,
    private readonly auditService: AuditService,
  ) {}

  private toDecimalNumber(value: unknown): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Number(value);
    if (typeof value === 'object' && value !== null && 'toNumber' in value) {
      const decimal = value as { toNumber(): number };
      return decimal.toNumber();
    }
    return Number(value);
  }

  private resolveRange(from?: string, to?: string): OverviewRange {
    if (from || to) {
      const parsedFrom = parseMelbourneDay(from);
      const parsedTo = parseMelbourneDayEnd(to) ?? parseMelbourneDay(to);
      const finalFrom = parsedFrom ?? new Date(0);
      const finalTo = parsedTo ?? new Date();
      if (finalTo.getTime() < finalFrom.getTime()) {
        throw new BadRequestException('to must be after from');
      }
      return { from: finalFrom, to: finalTo };
    }
    return melbourneDayBounds();
  }

  private async accessibleBrandIds(user: AuthenticatedUser): Promise<string[]> {
    if (await this.storeAccess.isPlatformAdmin(user)) {
      const brands = await this.prisma.brand.findMany({ select: { id: true } });
      return brands.map((brand) => brand.id);
    }
    const brands = await this.storeAccess.listAccessibleBrands(user);
    return brands.map((brand) => brand.id);
  }

  async getOverview(
    user: AuthenticatedUser,
    from?: string,
    to?: string,
  ): Promise<Record<string, unknown>> {
    const isPlatform = await this.storeAccess.isPlatformAdmin(user);
    const range = this.resolveRange(from, to);

    const brands = isPlatform
      ? await this.prisma.brand.findMany({
          include: {
            locations: true,
            paymentSettings: true,
            domains: {
              where: { isActive: true },
              orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
              take: 1,
            },
            _count: { select: { menuItems: true } },
          },
          orderBy: { name: 'asc' },
        })
      : await this.prisma.brand.findMany({
          where: {
            memberships: {
              some: {
                userId: user.id,
                isActive: true,
                role: {
                  in: [
                    StoreMembershipRole.PLATFORM_ADMIN,
                    StoreMembershipRole.STORE_ADMIN,
                  ],
                },
              },
            },
          },
          include: {
            locations: true,
            paymentSettings: true,
            domains: {
              where: { isActive: true },
              orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
              take: 1,
            },
            _count: { select: { menuItems: true } },
          },
          orderBy: { name: 'asc' },
        });

    const brandIds = brands.map((brand) => brand.id);

    const locationBrandMap = new Map<string, string>();
    brands.forEach((brand) => {
      brand.locations.forEach((location) => {
        locationBrandMap.set(location.id, brand.id);
      });
    });

    const paidOrders = brandIds.length
      ? await this.prisma.order.findMany({
          where: {
            paymentStatus: PaymentStatus.PAID,
            location: { brandId: { in: brandIds } },
            OR: [
              { paidAt: { gte: range.from, lte: range.to } },
              {
                paidAt: null,
                createdAt: { gte: range.from, lte: range.to },
              },
            ],
          },
          select: {
            id: true,
            total: true,
            paymentMethod: true,
            channel: true,
            createdAt: true,
            paidAt: true,
            locationId: true,
          },
        })
      : [];

    const liveOrders = brandIds.length
      ? await this.prisma.order.findMany({
          where: {
            status: { notIn: [OrderStatus.COMPLETED, OrderStatus.CANCELLED] },
            location: { brandId: { in: brandIds } },
          },
          select: {
            id: true,
            status: true,
            createdAt: true,
            locationId: true,
          },
        })
      : [];

    const revenueByBrand = new Map<string, number>();
    const ordersByBrand = new Map<string, number>();
    let totalRevenue = 0;
    let totalOrders = 0;

    for (const order of paidOrders) {
      const brandId = locationBrandMap.get(order.locationId);
      if (!brandId) continue;
      const total = this.toDecimalNumber(order.total);
      totalRevenue += total;
      totalOrders += 1;
      revenueByBrand.set(brandId, (revenueByBrand.get(brandId) ?? 0) + total);
      ordersByBrand.set(brandId, (ordersByBrand.get(brandId) ?? 0) + 1);
    }

    const liveByBrand = new Map<string, number>();
    for (const order of liveOrders) {
      const brandId = locationBrandMap.get(order.locationId);
      if (!brandId) continue;
      liveByBrand.set(brandId, (liveByBrand.get(brandId) ?? 0) + 1);
    }

    const storeRows = brands.map((brand) => {
      const primaryDomain = brand.domains[0];
      const revenue = revenueByBrand.get(brand.id) ?? 0;
      const orders = ordersByBrand.get(brand.id) ?? 0;
      const live = liveByBrand.get(brand.id) ?? 0;

      const alerts: string[] = [];
      if (!brand.isActive) {
        alerts.push('Store suspended');
      }
      const payment = brand.paymentSettings;
      if (payment && !payment.cardTerminalEnabled && !payment.cardOnlineEnabled) {
        alerts.push('Cash-only (no card payments enabled)');
      }
      if (!brand.locations.some((location) => location.openingHours)) {
        alerts.push('Opening hours missing');
      }
      if ((brand._count?.menuItems ?? 0) === 0) {
        alerts.push('No menu items');
      }

      return {
        id: brand.id,
        slug: brand.slug,
        name: brand.name,
        status: brand.status,
        isActive: brand.isActive,
        primaryHost: primaryDomain?.host ?? null,
        primaryPath: primaryDomain?.pathPrefix ?? null,
        locations: brand.locations.length,
        menuItemCount: brand._count?.menuItems ?? 0,
        paymentProvider: brand.paymentSettings?.provider ?? 'NONE',
        cardEnabled: Boolean(
          brand.paymentSettings?.cardTerminalEnabled ||
            brand.paymentSettings?.cardOnlineEnabled,
        ),
        revenue,
        orders,
        liveOrders: live,
        alerts,
      };
    });

    const alertsCount = storeRows.reduce(
      (sum, row) => sum + row.alerts.length,
      0,
    );

    return {
      range: {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        timezone: MELBOURNE_TZ,
      },
      totals: {
        storeCount: brands.length,
        activeStoreCount: brands.filter((brand) => brand.isActive).length,
        suspendedStoreCount: brands.filter((brand) => !brand.isActive).length,
        revenue: totalRevenue,
        orders: totalOrders,
        liveOrders: liveOrders.length,
        alerts: alertsCount,
        averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      },
      stores: storeRows,
    };
  }

  async getSalesReport(
    user: AuthenticatedUser,
    from?: string,
    to?: string,
    brandFilter?: string,
  ): Promise<Record<string, unknown>> {
    const range = this.resolveRange(from, to);
    const brandIds = await this.resolveBrandFilter(user, brandFilter);

    if (brandIds.length === 0) {
      return {
        range: {
          from: range.from.toISOString(),
          to: range.to.toISOString(),
          timezone: MELBOURNE_TZ,
        },
        totals: {
          revenue: 0,
          orders: 0,
          averageOrderValue: 0,
        },
        days: [],
        paymentMix: [],
        channelMix: [],
      };
    }

    const orders = await this.prisma.order.findMany({
      where: {
        paymentStatus: PaymentStatus.PAID,
        location: { brandId: { in: brandIds } },
        OR: [
          { paidAt: { gte: range.from, lte: range.to } },
          {
            paidAt: null,
            createdAt: { gte: range.from, lte: range.to },
          },
        ],
      },
      select: {
        total: true,
        paymentMethod: true,
        channel: true,
        createdAt: true,
        paidAt: true,
      },
    });

    let revenue = 0;
    const dayMap = new Map<string, { revenue: number; orders: number }>();
    const paymentMap = new Map<string, { revenue: number; orders: number }>();
    const channelMap = new Map<string, { revenue: number; orders: number }>();

    for (const order of orders) {
      const total = this.toDecimalNumber(order.total);
      revenue += total;
      const bucketDate = order.paidAt ?? order.createdAt;
      const dayKey = melbourneDayKey(bucketDate);
      const dayBucket = dayMap.get(dayKey) ?? { revenue: 0, orders: 0 };
      dayBucket.revenue += total;
      dayBucket.orders += 1;
      dayMap.set(dayKey, dayBucket);

      const paymentKey = order.paymentMethod ?? 'UNKNOWN';
      const paymentBucket =
        paymentMap.get(paymentKey) ?? { revenue: 0, orders: 0 };
      paymentBucket.revenue += total;
      paymentBucket.orders += 1;
      paymentMap.set(paymentKey, paymentBucket);

      const channelKey = order.channel ?? 'WEB';
      const channelBucket =
        channelMap.get(channelKey) ?? { revenue: 0, orders: 0 };
      channelBucket.revenue += total;
      channelBucket.orders += 1;
      channelMap.set(channelKey, channelBucket);
    }

    const days = Array.from(dayMap.entries())
      .map(([date, value]) => ({
        date,
        revenue: value.revenue,
        orders: value.orders,
      }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

    const paymentMix = Array.from(paymentMap.entries()).map(([method, value]) => ({
      method,
      revenue: value.revenue,
      orders: value.orders,
    }));

    const channelMix = Array.from(channelMap.entries()).map(([channel, value]) => ({
      channel,
      revenue: value.revenue,
      orders: value.orders,
    }));

    return {
      range: {
        from: range.from.toISOString(),
        to: range.to.toISOString(),
        timezone: MELBOURNE_TZ,
      },
      totals: {
        revenue,
        orders: orders.length,
        averageOrderValue: orders.length > 0 ? revenue / orders.length : 0,
      },
      days,
      paymentMix,
      channelMix,
    };
  }

  async getSalesReportCsv(
    user: AuthenticatedUser,
    from?: string,
    to?: string,
    brandFilter?: string,
  ): Promise<string> {
    const report = (await this.getSalesReport(user, from, to, brandFilter)) as {
      days: Array<{ date: string; revenue: number; orders: number }>;
    };

    const header = 'date,revenue,orders';
    const rows = report.days.map(
      (day) => `${day.date},${day.revenue.toFixed(2)},${day.orders}`,
    );
    return [header, ...rows].join('\n');
  }

  async getOnboarding(brandSlug: string): Promise<Record<string, unknown>> {
    const slug = brandSlug.trim().toLowerCase();
    const brand = await this.prisma.brand.findUnique({
      where: { slug },
      include: {
        locations: true,
        paymentSettings: true,
        domains: true,
        _count: {
          select: {
            menuItems: true,
            memberships: true,
          },
        },
      },
    });

    if (!brand) {
      throw new NotFoundException(`Store "${slug}" not found.`);
    }

    const primaryLocation =
      brand.locations.find((location) => location.isDefault) ?? brand.locations[0];

    const checks = [
      {
        key: 'brand',
        label: 'Store brand & logo configured',
        complete: Boolean(brand.name && brand.logoUrl),
      },
      {
        key: 'domain',
        label: 'Domain or path prefix assigned',
        complete: brand.domains.length > 0,
      },
      {
        key: 'location',
        label: 'At least one location configured',
        complete: brand.locations.length > 0,
      },
      {
        key: 'hours',
        label: 'Opening hours set',
        complete: Boolean(primaryLocation?.openingHours),
      },
      {
        key: 'contact',
        label: 'Contact phone or email set',
        complete: Boolean(primaryLocation?.phone || primaryLocation?.email),
      },
      {
        key: 'payments',
        label: 'Payment methods enabled',
        complete: Boolean(
          brand.paymentSettings &&
            (brand.paymentSettings.cashEnabled ||
              brand.paymentSettings.cardTerminalEnabled ||
              brand.paymentSettings.cardOnlineEnabled),
        ),
      },
      {
        key: 'card',
        label: 'Card payments enabled',
        complete: Boolean(
          brand.paymentSettings?.cardTerminalEnabled ||
            brand.paymentSettings?.cardOnlineEnabled,
        ),
      },
      {
        key: 'menu',
        label: 'Menu has active items',
        complete: (brand._count?.menuItems ?? 0) > 0,
      },
      {
        key: 'team',
        label: 'Team members assigned',
        complete: (brand._count?.memberships ?? 0) > 0,
      },
      {
        key: 'live',
        label: 'Store is live',
        complete: brand.isActive && brand.status === 'LIVE',
      },
    ];

    const completed = checks.filter((check) => check.complete).length;

    return {
      brand: {
        id: brand.id,
        slug: brand.slug,
        name: brand.name,
        status: brand.status,
        isActive: brand.isActive,
      },
      completed,
      total: checks.length,
      percentComplete: Math.round((completed / checks.length) * 100),
      checks,
    };
  }

  async getCustomers(
    user: AuthenticatedUser,
    query?: string,
    brandFilter?: string,
  ): Promise<
    Array<{
      key: string;
      keyType: 'phone' | 'email';
      name: string | null;
      email: string | null;
      phone: string | null;
      orderCount: number;
      lastOrderAt: Date | null;
      totalSpent: number;
    }>
  > {
    const brandIds = await this.resolveBrandFilter(user, brandFilter);
    if (brandIds.length === 0) {
      return [];
    }

    const trimmed = query?.trim();
    const orConditions: Prisma.OrderWhereInput[] = [];
    if (trimmed) {
      const term = trimmed;
      orConditions.push(
        { guestPhone: { contains: term, mode: 'insensitive' } },
        { guestEmail: { contains: term, mode: 'insensitive' } },
        { guestName: { contains: term, mode: 'insensitive' } },
        { user: { email: { contains: term, mode: 'insensitive' } } },
        { user: { firstName: { contains: term, mode: 'insensitive' } } },
        { user: { lastName: { contains: term, mode: 'insensitive' } } },
      );
    }

    const orders = await this.prisma.order.findMany({
      where: {
        location: { brandId: { in: brandIds } },
        ...(orConditions.length > 0 ? { OR: orConditions } : {}),
      },
      select: {
        id: true,
        guestEmail: true,
        guestName: true,
        guestPhone: true,
        total: true,
        createdAt: true,
        user: {
          select: { email: true, firstName: true, lastName: true, id: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const grouped = new Map<
      string,
      {
        keyType: 'phone' | 'email';
        name: string | null;
        email: string | null;
        phone: string | null;
        orderCount: number;
        lastOrderAt: Date | null;
        totalSpent: number;
      }
    >();

    for (const order of orders) {
      const phone = order.guestPhone?.trim() || null;
      const email = (order.user?.email ?? order.guestEmail ?? '').trim() || null;
      const name =
        order.user
          ? `${order.user.firstName ?? ''} ${order.user.lastName ?? ''}`
              .trim() || null
          : order.guestName?.trim() || null;

      const key = phone ? `phone:${phone.toLowerCase()}` : email ? `email:${email.toLowerCase()}` : null;
      if (!key) continue;

      const record = grouped.get(key);
      const total = this.toDecimalNumber(order.total);
      if (record) {
        record.orderCount += 1;
        record.totalSpent += total;
        if (!record.lastOrderAt || record.lastOrderAt < order.createdAt) {
          record.lastOrderAt = order.createdAt;
        }
        if (!record.email && email) record.email = email;
        if (!record.phone && phone) record.phone = phone;
        if (!record.name && name) record.name = name;
      } else {
        grouped.set(key, {
          keyType: phone ? 'phone' : 'email',
          name,
          email,
          phone,
          orderCount: 1,
          lastOrderAt: order.createdAt,
          totalSpent: total,
        });
      }
    }

    return Array.from(grouped.entries())
      .map(([key, value]) => ({ key, ...value }))
      .sort((a, b) => {
        const aTime = a.lastOrderAt?.getTime() ?? 0;
        const bTime = b.lastOrderAt?.getTime() ?? 0;
        return bTime - aTime;
      });
  }

  async getCustomerOrders(
    user: AuthenticatedUser,
    key: string,
    brandFilter?: string,
  ): Promise<unknown[]> {
    const brandIds = await this.resolveBrandFilter(user, brandFilter);
    if (brandIds.length === 0) {
      return [];
    }

    const decoded = decodeURIComponent(key.trim());
    const [rawType, ...rest] = decoded.split(':');
    const rawValue = rest.join(':');
    const value = rawValue || decoded;

    const type: 'phone' | 'email' = rawType === 'email' ? 'email' : 'phone';

    const where: Prisma.OrderWhereInput = {
      location: { brandId: { in: brandIds } },
    };

    if (type === 'phone') {
      where.guestPhone = { equals: value, mode: 'insensitive' };
    } else {
      where.OR = [
        { guestEmail: { equals: value, mode: 'insensitive' } },
        { user: { email: { equals: value, mode: 'insensitive' } } },
      ];
    }

    return this.prisma.order.findMany({
      where,
      include: {
        items: true,
        location: {
          select: { id: true, name: true, brand: { select: { slug: true, name: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getActivity(
    user: AuthenticatedUser,
    storeFilter?: string,
    limit?: number,
  ): Promise<unknown[]> {
    const isPlatform = await this.storeAccess.isPlatformAdmin(user);

    let storeId: string | undefined;
    if (storeFilter) {
      const brand = await this.prisma.brand.findUnique({
        where: { slug: storeFilter.trim().toLowerCase() },
        select: { id: true },
      });
      if (!brand) {
        throw new NotFoundException(`Store "${storeFilter}" not found.`);
      }
      if (!isPlatform) {
        await this.storeAccess.assertCanManageStore(user, storeFilter);
      }
      storeId = brand.id;
    } else if (!isPlatform) {
      throw new BadRequestException(
        'Non-platform users must specify a store slug.',
      );
    }

    return this.auditService.list({ storeId, limit });
  }

  async listDomains(): Promise<unknown[]> {
    return this.prisma.storeDomain.findMany({
      include: {
        store: { select: { id: true, slug: true, name: true, isActive: true } },
        location: { select: { id: true, name: true, slug: true } },
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async createDomain(
    dto: CreateDomainDto,
    actor: AuthenticatedUser,
  ): Promise<unknown> {
    const storeSlug = dto.storeSlug.trim().toLowerCase();
    const brand = await this.prisma.brand.findUnique({ where: { slug: storeSlug } });
    if (!brand) {
      throw new NotFoundException(`Store "${storeSlug}" not found.`);
    }

    const host = dto.host?.trim().toLowerCase() || null;
    const pathPrefix = dto.pathPrefix ? this.normalizePathPrefix(dto.pathPrefix) : null;

    if (!host && !pathPrefix) {
      throw new BadRequestException('Provide host or pathPrefix.');
    }

    if (host) {
      const existing = await this.prisma.storeDomain.findUnique({
        where: { host },
      });
      if (existing) {
        throw new ConflictException(`Host "${host}" is already assigned.`);
      }
    }
    if (pathPrefix) {
      const existing = await this.prisma.storeDomain.findUnique({
        where: { pathPrefix },
      });
      if (existing) {
        throw new ConflictException(`Path "${pathPrefix}" is already assigned.`);
      }
    }

    const isPrimary = dto.isPrimary ?? false;

    const domain = await this.prisma.$transaction(async (tx) => {
      if (isPrimary) {
        await tx.storeDomain.updateMany({
          where: { storeId: brand.id, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      return tx.storeDomain.create({
        data: {
          storeId: brand.id,
          host,
          pathPrefix,
          isPrimary,
          isActive: dto.isActive ?? true,
        },
      });
    });

    await this.auditService.log(
      actor.id,
      brand.id,
      AuditAction.DOMAIN_CREATED,
      `Domain ${host ?? pathPrefix ?? domain.id} created for ${brand.slug}`,
      { domainId: domain.id, host, pathPrefix, isPrimary },
    );

    return domain;
  }

  async updateDomain(
    domainId: string,
    dto: UpdateDomainDto,
    actor: AuthenticatedUser,
  ): Promise<unknown> {
    const existing = await this.prisma.storeDomain.findUnique({
      where: { id: domainId },
    });
    if (!existing) {
      throw new NotFoundException('Domain not found.');
    }

    const host =
      dto.host === undefined ? undefined : dto.host?.trim().toLowerCase() || null;
    const pathPrefix =
      dto.pathPrefix === undefined
        ? undefined
        : dto.pathPrefix
          ? this.normalizePathPrefix(dto.pathPrefix)
          : null;

    if (host && host !== existing.host) {
      const conflict = await this.prisma.storeDomain.findUnique({ where: { host } });
      if (conflict && conflict.id !== domainId) {
        throw new ConflictException(`Host "${host}" is already assigned.`);
      }
    }
    if (pathPrefix && pathPrefix !== existing.pathPrefix) {
      const conflict = await this.prisma.storeDomain.findUnique({
        where: { pathPrefix },
      });
      if (conflict && conflict.id !== domainId) {
        throw new ConflictException(`Path "${pathPrefix}" is already assigned.`);
      }
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimary === true) {
        await tx.storeDomain.updateMany({
          where: {
            storeId: existing.storeId,
            isPrimary: true,
            id: { not: domainId },
          },
          data: { isPrimary: false },
        });
      }
      return tx.storeDomain.update({
        where: { id: domainId },
        data: {
          ...(host !== undefined ? { host } : {}),
          ...(pathPrefix !== undefined ? { pathPrefix } : {}),
          ...(dto.isPrimary !== undefined ? { isPrimary: dto.isPrimary } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });
    });

    await this.auditService.log(
      actor.id,
      existing.storeId,
      AuditAction.DOMAIN_UPDATED,
      `Domain ${updated.host ?? updated.pathPrefix ?? updated.id} updated`,
      { domainId, ...dto },
    );

    return updated;
  }

  async listMenuTemplates(): Promise<unknown[]> {
    return this.prisma.menuTemplate.findMany({
      include: {
        sourceBrand: { select: { id: true, slug: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private buildMenuSnapshot(
    brand: {
      menuCategories: Array<{
        slug: string;
        label: string;
        sortOrder: number;
        supportsSizeOptions: boolean;
        supportsExtras: boolean;
        isActive: boolean;
      }>;
      menuItems: Array<{
        slug: string;
        number: number;
        name: string;
        description: string;
        price: Prisma.Decimal;
        categorySlug: string;
        imageUrl: string;
        imageAlt: string;
        badges: string[];
        priceNote: string | null;
        ingredients: string[];
        sizeOptions: unknown;
        sizePricing: unknown;
        allowedToppingIds: string[];
        isActive: boolean;
      }>;
    },
    options: { itemSlugs?: string[]; lockItems?: boolean },
  ): MenuTemplateSnapshot {
    const filterSlugs =
      options.itemSlugs && options.itemSlugs.length > 0
        ? new Set(options.itemSlugs.map((slug) => slug.trim().toLowerCase()).filter(Boolean))
        : null;

    const items = brand.menuItems
      .filter((item) => !filterSlugs || filterSlugs.has(item.slug.toLowerCase()))
      .map((item) => ({
        slug: item.slug,
        number: item.number,
        name: item.name,
        description: item.description,
        price: item.price.toString(),
        categorySlug: item.categorySlug,
        imageUrl: item.imageUrl,
        imageAlt: item.imageAlt,
        badges: item.badges,
        priceNote: item.priceNote,
        ingredients: item.ingredients,
        sizeOptions: item.sizeOptions,
        sizePricing: item.sizePricing,
        allowedToppingIds: item.allowedToppingIds,
        isActive: item.isActive,
      }));

    if (filterSlugs && items.length === 0) {
      throw new BadRequestException('No matching menu items found for the selected slugs.');
    }

    const categorySlugs = new Set(items.map((item) => item.categorySlug));
    const categories = brand.menuCategories
      .filter((category) => !filterSlugs || categorySlugs.has(category.slug))
      .map((category) => ({
        slug: category.slug,
        label: category.label,
        sortOrder: category.sortOrder,
        supportsSizeOptions: category.supportsSizeOptions,
        supportsExtras: category.supportsExtras,
        isActive: category.isActive,
      }));

    return {
      lockItems: options.lockItems ?? false,
      categories,
      items,
    };
  }

  private async applySnapshotToBrand(
    brandId: string,
    snapshot: MenuTemplateSnapshot,
    lockItems: boolean,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const category of snapshot.categories) {
        await tx.menuCategory.upsert({
          where: { brandId_slug: { brandId, slug: category.slug } },
          update: {
            label: category.label,
            sortOrder: category.sortOrder,
            supportsSizeOptions: category.supportsSizeOptions,
            supportsExtras: category.supportsExtras,
            isActive: category.isActive,
          },
          create: {
            brandId,
            slug: category.slug,
            label: category.label,
            sortOrder: category.sortOrder,
            supportsSizeOptions: category.supportsSizeOptions,
            supportsExtras: category.supportsExtras,
            isActive: category.isActive,
          },
        });
      }

      for (const item of snapshot.items) {
        const priceValue = new Prisma.Decimal(item.price);
        await tx.menuItem.upsert({
          where: { brandId_slug: { brandId, slug: item.slug } },
          update: {
            number: item.number,
            name: item.name,
            description: item.description,
            price: priceValue,
            categorySlug: item.categorySlug,
            imageUrl: item.imageUrl,
            imageAlt: item.imageAlt,
            badges: item.badges as never,
            priceNote: item.priceNote,
            ingredients: item.ingredients,
            sizeOptions:
              item.sizeOptions === null
                ? Prisma.JsonNull
                : (item.sizeOptions as Prisma.InputJsonValue),
            sizePricing:
              item.sizePricing === null
                ? Prisma.JsonNull
                : (item.sizePricing as Prisma.InputJsonValue),
            allowedToppingIds: item.allowedToppingIds,
            isActive: item.isActive,
            isFranchiseLocked: lockItems,
          },
          create: {
            brandId,
            slug: item.slug,
            number: item.number,
            name: item.name,
            description: item.description,
            price: priceValue,
            categorySlug: item.categorySlug,
            imageUrl: item.imageUrl,
            imageAlt: item.imageAlt,
            badges: item.badges as never,
            priceNote: item.priceNote,
            ingredients: item.ingredients,
            sizeOptions:
              item.sizeOptions === undefined || item.sizeOptions === null
                ? undefined
                : (item.sizeOptions as Prisma.InputJsonValue),
            sizePricing:
              item.sizePricing === undefined || item.sizePricing === null
                ? undefined
                : (item.sizePricing as Prisma.InputJsonValue),
            allowedToppingIds: item.allowedToppingIds,
            isActive: item.isActive,
            isFranchiseLocked: lockItems,
          },
        });
      }
    });
  }

  async createMenuTemplate(
    dto: CreateMenuTemplateDto,
    actor: AuthenticatedUser,
  ): Promise<unknown> {
    const slug = dto.sourceBrandSlug.trim().toLowerCase();
    const brand = await this.prisma.brand.findUnique({
      where: { slug },
      include: {
        menuCategories: true,
        menuItems: true,
      },
    });
    if (!brand) {
      throw new NotFoundException(`Source store "${slug}" not found.`);
    }

    const snapshot = this.buildMenuSnapshot(brand, {
      itemSlugs: dto.itemSlugs,
      lockItems: dto.lockItems,
    });

    return this.prisma.menuTemplate.create({
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        sourceBrandId: brand.id,
        createdByUserId: actor.id,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async transferMenu(
    dto: TransferMenuDto,
    actor: AuthenticatedUser,
  ): Promise<{
    itemCount: number;
    applied: string[];
    failed: Array<{ slug: string; reason: string }>;
    templateId: string | null;
  }> {
    const sourceSlug = dto.sourceBrandSlug.trim().toLowerCase();
    const targetSlugs = [
      ...new Set(dto.targetBrandSlugs.map((slug) => slug.trim().toLowerCase()).filter(Boolean)),
    ];

    if (targetSlugs.some((slug) => slug === sourceSlug)) {
      throw new BadRequestException('Target stores must be different from the source store.');
    }

    const brand = await this.prisma.brand.findUnique({
      where: { slug: sourceSlug },
      include: {
        menuCategories: true,
        menuItems: true,
      },
    });
    if (!brand) {
      throw new NotFoundException(`Source store "${sourceSlug}" not found.`);
    }

    const lockItems = dto.lockItems ?? false;
    const snapshot = this.buildMenuSnapshot(brand, {
      itemSlugs: dto.itemSlugs,
      lockItems,
    });

    let templateId: string | null = null;
    if (dto.saveAsName?.trim()) {
      const template = await this.prisma.menuTemplate.create({
        data: {
          name: dto.saveAsName.trim(),
          description: dto.saveAsDescription?.trim() || null,
          sourceBrandId: brand.id,
          createdByUserId: actor.id,
          snapshot: snapshot as unknown as Prisma.InputJsonValue,
        },
      });
      templateId = template.id;
    }

    const applied: string[] = [];
    const failed: Array<{ slug: string; reason: string }> = [];

    for (const slug of targetSlugs) {
      try {
        const target = await this.prisma.brand.findUnique({ where: { slug } });
        if (!target) {
          failed.push({ slug, reason: 'Store not found' });
          continue;
        }

        await this.applySnapshotToBrand(target.id, snapshot, lockItems);
        await this.auditService.log(
          actor.id,
          target.id,
          AuditAction.MENU_TEMPLATE_APPLIED,
          `Transferred ${snapshot.items.length} menu item(s) from ${brand.slug} to ${target.slug}`,
          {
            sourceBrandSlug: brand.slug,
            itemCount: snapshot.items.length,
            lockItems,
            templateId,
          },
        );
        applied.push(slug);
      } catch (error) {
        failed.push({ slug, reason: (error as Error).message });
      }
    }

    return {
      itemCount: snapshot.items.length,
      applied,
      failed,
      templateId,
    };
  }

  async applyMenuTemplate(
    templateId: string,
    dto: ApplyMenuTemplateDto,
    actor: AuthenticatedUser,
  ): Promise<{ applied: string[]; failed: Array<{ slug: string; reason: string }> }> {
    const template = await this.prisma.menuTemplate.findUnique({
      where: { id: templateId },
    });
    if (!template) {
      throw new NotFoundException('Menu template not found.');
    }

    const snapshot = template.snapshot as unknown as MenuTemplateSnapshot;
    const lockItems = dto.lockItems ?? snapshot.lockItems ?? false;

    const applied: string[] = [];
    const failed: Array<{ slug: string; reason: string }> = [];

    for (const rawSlug of dto.targetBrandSlugs) {
      const slug = rawSlug.trim().toLowerCase();
      try {
        const brand = await this.prisma.brand.findUnique({ where: { slug } });
        if (!brand) {
          failed.push({ slug, reason: 'Store not found' });
          continue;
        }

        await this.applySnapshotToBrand(brand.id, snapshot, lockItems);
        await this.auditService.log(
          actor.id,
          brand.id,
          AuditAction.MENU_TEMPLATE_APPLIED,
          `Menu template "${template.name}" applied to ${brand.slug}`,
          { templateId, lockItems },
        );

        applied.push(slug);
      } catch (error) {
        failed.push({ slug, reason: (error as Error).message });
      }
    }

    return { applied, failed };
  }

  async pushDeal(
    dealId: string,
    dto: PushDealDto,
    actor: AuthenticatedUser,
  ): Promise<{ pushed: string[]; failed: Array<{ slug: string; reason: string }> }> {
    const deal = await this.prisma.deal.findUnique({ where: { id: dealId } });
    if (!deal) {
      throw new NotFoundException('Deal not found.');
    }

    const pushed: string[] = [];
    const failed: Array<{ slug: string; reason: string }> = [];

    for (const rawSlug of dto.targetBrandSlugs) {
      const slug = rawSlug.trim().toLowerCase();
      try {
        const brand = await this.prisma.brand.findUnique({ where: { slug } });
        if (!brand) {
          failed.push({ slug, reason: 'Store not found' });
          continue;
        }
        if (brand.id === deal.brandId) {
          failed.push({ slug, reason: 'Source store cannot be a target' });
          continue;
        }

        const existing = await this.prisma.deal.findUnique({
          where: { brandId_slug: { brandId: brand.id, slug: deal.slug } },
        });

        const payload: Prisma.DealUncheckedCreateInput = {
          brandId: brand.id,
          slug: deal.slug,
          title: deal.title,
          description: deal.description,
          badgeLabel: deal.badgeLabel,
          discountType: deal.discountType as DealDiscountType,
          discountValue: deal.discountValue,
          promoCode: null,
          imageUrl: deal.imageUrl,
          imageAlt: deal.imageAlt,
          termsNote: deal.termsNote,
          ctaLabel: deal.ctaLabel,
          ctaHref: deal.ctaHref,
          validFrom: deal.validFrom,
          validUntil: deal.validUntil,
          sortOrder: deal.sortOrder,
          isActive: deal.isActive,
          isFeatured: deal.isFeatured,
          scope: DealScope.STORE,
        };

        if (existing) {
          await this.prisma.deal.update({
            where: { id: existing.id },
            data: {
              title: payload.title,
              description: payload.description,
              badgeLabel: payload.badgeLabel,
              discountType: payload.discountType,
              discountValue: payload.discountValue,
              imageUrl: payload.imageUrl,
              imageAlt: payload.imageAlt,
              termsNote: payload.termsNote,
              ctaLabel: payload.ctaLabel,
              ctaHref: payload.ctaHref,
              validFrom: payload.validFrom,
              validUntil: payload.validUntil,
              sortOrder: payload.sortOrder,
              isActive: payload.isActive,
              isFeatured: payload.isFeatured,
              scope: payload.scope,
            },
          });
        } else {
          await this.prisma.deal.create({ data: payload });
        }

        await this.auditService.log(
          actor.id,
          brand.id,
          AuditAction.DEAL_PUSHED,
          `Deal "${deal.title}" pushed to ${brand.slug}`,
          { sourceDealId: deal.id },
        );

        pushed.push(slug);
      } catch (error) {
        failed.push({ slug, reason: (error as Error).message });
      }
    }

    return { pushed, failed };
  }

  private async resolveBrandFilter(
    user: AuthenticatedUser,
    brandFilter?: string,
  ): Promise<string[]> {
    const accessibleIds = await this.accessibleBrandIds(user);
    if (accessibleIds.length === 0) {
      return [];
    }

    if (!brandFilter) {
      return accessibleIds;
    }

    const slug = brandFilter.trim().toLowerCase();
    const brand = await this.prisma.brand.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!brand) {
      throw new NotFoundException(`Store "${slug}" not found.`);
    }
    if (!accessibleIds.includes(brand.id)) {
      throw new NotFoundException(`Store "${slug}" not accessible.`);
    }
    return [brand.id];
  }

  private normalizePathPrefix(value: string): string {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed || trimmed === '/') {
      throw new BadRequestException('pathPrefix must be a non-root path like /ninja');
    }
    const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return withSlash.replace(/\/+$/, '') || withSlash;
  }
}
