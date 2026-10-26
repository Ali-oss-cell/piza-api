import { BadRequestException, Injectable } from '@nestjs/common';
import {
  OrderChannel,
  OrderStatus,
  PaymentStatus,
  Prisma,
  StorefrontLayout,
} from '@prisma/client';
import { BrandsService } from '../brands/brands.service';
import { normalizeOpeningHours } from '../orders/opening-hours.types';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateStoreSettingsDto } from './dto/update-store-settings.dto';

export type StoreSettingsResponse = {
  id: string;
  storeName: string;
  tagline: string | null;
  logoUrl: string | null;
  logoDarkUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  backgroundLightColor: string | null;
  backgroundDarkColor: string | null;
  heroImageUrl: string | null;
  heroImageDarkUrl: string | null;
  darkModeEnabled: boolean;
  storefrontLayout: 'classic' | 'menu_first' | 'magazine' | 'portfolio';
  googleSiteVerification: string | null;
  deliveryFee: unknown;
  minOrderAmount: unknown;
  onlineOrderingEnabled: boolean;
  deliveryEnabled: boolean;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  openingHours: unknown;
  updatedAt: Date;
};

function toPublicLayout(
  layout: StorefrontLayout | string | null | undefined,
): 'classic' | 'menu_first' | 'magazine' | 'portfolio' {
  const value = String(layout ?? 'CLASSIC').toUpperCase();
  if (value === 'MENU_FIRST') return 'menu_first';
  if (value === 'MAGAZINE') return 'magazine';
  if (value === 'PORTFOLIO') return 'portfolio';
  return 'classic';
}

function toPrismaLayout(raw?: string): StorefrontLayout | undefined {
  if (raw === undefined) return undefined;
  const value = raw.trim().toUpperCase().replace(/-/g, '_');
  if (value === 'MENU_FIRST') return StorefrontLayout.MENU_FIRST;
  if (value === 'MAGAZINE') return StorefrontLayout.MAGAZINE;
  if (value === 'PORTFOLIO') return StorefrontLayout.PORTFOLIO;
  if (value === 'CLASSIC') return StorefrontLayout.CLASSIC;
  throw new BadRequestException(
    'storefrontLayout must be classic, menu_first, magazine, or portfolio.',
  );
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandsService: BrandsService,
  ) {}

  async findStoreSettings(
    brandSlug?: string,
    locationId?: string,
  ): Promise<StoreSettingsResponse> {
    const brand = await this.brandsService.resolveBrand(brandSlug);
    const location = locationId?.trim()
      ? await this.prisma.location.findFirst({
          where: {
            id: locationId.trim(),
            brandId: brand.id,
            isActive: true,
          },
        })
      : (
          await this.brandsService.getBrandWithDefaultLocation(brandSlug)
        ).locations[0];

    if (!location) {
      throw new BadRequestException(
        'No active location configured for this brand.',
      );
    }

    return {
      id: location.id,
      storeName: brand.name,
      tagline: brand.tagline,
      logoUrl: brand.logoUrl,
      logoDarkUrl: brand.logoDarkUrl,
      primaryColor: brand.primaryColor,
      secondaryColor: brand.secondaryColor,
      backgroundLightColor: brand.backgroundLightColor,
      backgroundDarkColor: brand.backgroundDarkColor,
      heroImageUrl: brand.heroImageUrl,
      heroImageDarkUrl: brand.heroImageDarkUrl,
      darkModeEnabled: brand.darkModeEnabled,
      storefrontLayout: toPublicLayout(brand.storefrontLayout),
      googleSiteVerification: brand.googleSiteVerification,
      deliveryFee: location.deliveryFee,
      minOrderAmount: location.minOrderAmount,
      onlineOrderingEnabled: location.onlineOrderingEnabled,
      deliveryEnabled: location.deliveryEnabled,
      contactEmail: location.email,
      contactPhone: location.phone,
      address: location.address,
      openingHours: location.openingHours,
      updatedAt: location.updatedAt,
    };
  }

  async updateStoreSettings(
    dto: UpdateStoreSettingsDto,
    brandSlug?: string,
  ): Promise<StoreSettingsResponse> {
    const brandWithLocation = await this.brandsService.getBrandWithDefaultLocation(brandSlug);
    const location = brandWithLocation.locations[0];
    const layoutUpdate = toPrismaLayout(dto.storefrontLayout);

    if (
      dto.storeName !== undefined ||
      dto.tagline !== undefined ||
      dto.logoUrl !== undefined ||
      dto.logoDarkUrl !== undefined ||
      dto.primaryColor !== undefined ||
      dto.secondaryColor !== undefined ||
      dto.backgroundLightColor !== undefined ||
      dto.backgroundDarkColor !== undefined ||
      dto.heroImageUrl !== undefined ||
      dto.heroImageDarkUrl !== undefined ||
      dto.darkModeEnabled !== undefined ||
      dto.googleSiteVerification !== undefined ||
      layoutUpdate !== undefined
    ) {
      await this.prisma.brand.update({
        where: { id: brandWithLocation.id },
        data: {
          ...(dto.storeName !== undefined ? { name: dto.storeName.trim() } : {}),
          ...(dto.tagline !== undefined ? { tagline: dto.tagline.trim() || null } : {}),
          ...(dto.logoUrl !== undefined
            ? { logoUrl: dto.logoUrl?.trim() || null }
            : {}),
          ...(dto.logoDarkUrl !== undefined
            ? { logoDarkUrl: dto.logoDarkUrl?.trim() || null }
            : {}),
          ...(dto.primaryColor !== undefined
            ? { primaryColor: dto.primaryColor?.trim() || null }
            : {}),
          ...(dto.secondaryColor !== undefined
            ? { secondaryColor: dto.secondaryColor?.trim() || null }
            : {}),
          ...(dto.heroImageUrl !== undefined
            ? { heroImageUrl: dto.heroImageUrl?.trim() || null }
            : {}),
          ...(dto.heroImageDarkUrl !== undefined
            ? { heroImageDarkUrl: dto.heroImageDarkUrl?.trim() || null }
            : {}),
          ...(dto.backgroundLightColor !== undefined
            ? { backgroundLightColor: dto.backgroundLightColor?.trim() || null }
            : {}),
          ...(dto.backgroundDarkColor !== undefined
            ? { backgroundDarkColor: dto.backgroundDarkColor?.trim() || null }
            : {}),
          ...(dto.darkModeEnabled !== undefined
            ? { darkModeEnabled: dto.darkModeEnabled }
            : {}),
          ...(layoutUpdate !== undefined ? { storefrontLayout: layoutUpdate } : {}),
          ...(dto.googleSiteVerification !== undefined
            ? {
                googleSiteVerification:
                  dto.googleSiteVerification?.trim() || null,
              }
            : {}),
        },
      });
    }

    let openingHoursUpdate: Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined;
    if (dto.openingHours !== undefined) {
      if (dto.openingHours === null) {
        openingHoursUpdate = Prisma.JsonNull;
      } else {
        const normalized = normalizeOpeningHours(dto.openingHours);
        if (!normalized) {
          throw new BadRequestException(
            'Invalid opening hours. Use HH:MM times and set close after open for each open day.',
          );
        }
        openingHoursUpdate = normalized as unknown as Prisma.InputJsonValue;
      }
    }

    const updatedLocation = await this.prisma.location.update({
      where: { id: location.id },
      data: {
        ...(dto.deliveryFee !== undefined ? { deliveryFee: dto.deliveryFee } : {}),
        ...(dto.minOrderAmount !== undefined ? { minOrderAmount: dto.minOrderAmount } : {}),
        ...(dto.onlineOrderingEnabled !== undefined
          ? { onlineOrderingEnabled: dto.onlineOrderingEnabled }
          : {}),
        ...(dto.deliveryEnabled !== undefined
          ? { deliveryEnabled: dto.deliveryEnabled }
          : {}),
        ...(dto.contactEmail !== undefined
          ? { email: dto.contactEmail.trim() || null }
          : {}),
        ...(dto.contactPhone !== undefined
          ? { phone: dto.contactPhone.trim() || null }
          : {}),
        ...(dto.address !== undefined ? { address: dto.address.trim() || null } : {}),
        ...(openingHoursUpdate !== undefined
          ? { openingHours: openingHoursUpdate }
          : {}),
      },
    });

    const brand = await this.prisma.brand.findUniqueOrThrow({
      where: { id: brandWithLocation.id },
    });

    return {
      id: updatedLocation.id,
      storeName: brand.name,
      tagline: brand.tagline,
      logoUrl: brand.logoUrl,
      logoDarkUrl: brand.logoDarkUrl,
      primaryColor: brand.primaryColor,
      secondaryColor: brand.secondaryColor,
      backgroundLightColor: brand.backgroundLightColor,
      backgroundDarkColor: brand.backgroundDarkColor,
      heroImageUrl: brand.heroImageUrl,
      heroImageDarkUrl: brand.heroImageDarkUrl,
      darkModeEnabled: brand.darkModeEnabled,
      storefrontLayout: toPublicLayout(brand.storefrontLayout),
      googleSiteVerification: brand.googleSiteVerification,
      deliveryFee: updatedLocation.deliveryFee,
      minOrderAmount: updatedLocation.minOrderAmount,
      onlineOrderingEnabled: updatedLocation.onlineOrderingEnabled,
      deliveryEnabled: updatedLocation.deliveryEnabled,
      contactEmail: updatedLocation.email,
      contactPhone: updatedLocation.phone,
      address: updatedLocation.address,
      openingHours: updatedLocation.openingHours,
      updatedAt: updatedLocation.updatedAt,
    };
  }

  /**
   * Store ops report: sales + online accept/refuse stats for admin oversight.
   */
  async getOpsReport(
    brandSlug?: string,
    fromIso?: string,
    toIso?: string,
  ): Promise<{
    range: { from: string; to: string };
    sales: {
      paidOrders: number;
      revenue: number;
      byChannel: Array<{ channel: string; orders: number; revenue: number }>;
    };
    online: {
      paidOnline: number;
      accepted: number;
      refused: number;
      refuseRate: number;
      refusalsByStaff: Array<{
        userId: string;
        name: string;
        count: number;
      }>;
    };
  }> {
    const brand = await this.brandsService.resolveBrand(brandSlug);
    const to = toIso?.trim() ? new Date(toIso) : new Date();
    const from = fromIso?.trim()
      ? new Date(fromIso)
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Invalid from/to date.');
    }

    const orders = await this.prisma.order.findMany({
      where: {
        location: { brandId: brand.id },
        isTraining: false,
        OR: [
          { paidAt: { gte: from, lte: to } },
          {
            paidAt: null,
            createdAt: { gte: from, lte: to },
          },
          { refusedAt: { gte: from, lte: to } },
        ],
      },
      select: {
        id: true,
        channel: true,
        status: true,
        paymentStatus: true,
        total: true,
        paidAt: true,
        createdAt: true,
        refusedAt: true,
        refusedByUserId: true,
        refusedByUser: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    const inPaidWindow = (order: (typeof orders)[number]) => {
      const ts = order.paidAt ?? order.createdAt;
      return ts >= from && ts <= to;
    };

    const paidForRevenue = orders.filter(
      (o) => o.paymentStatus === PaymentStatus.PAID && inPaidWindow(o),
    );

    const channelMap = new Map<string, { orders: number; revenue: number }>();
    let revenue = 0;
    for (const order of paidForRevenue) {
      const total = Number(order.total);
      revenue += total;
      const key = order.channel;
      const row = channelMap.get(key) ?? { orders: 0, revenue: 0 };
      row.orders += 1;
      row.revenue += total;
      channelMap.set(key, row);
    }

    const isOnlineChannel = (channel: OrderChannel) =>
      channel === OrderChannel.WEB || channel === OrderChannel.PHONE;

    const refused = orders.filter(
      (o) =>
        isOnlineChannel(o.channel) &&
        o.refusedAt != null &&
        o.refusedAt >= from &&
        o.refusedAt <= to,
    );

    const accepted = orders.filter(
      (o) =>
        isOnlineChannel(o.channel) &&
        o.refusedAt == null &&
        o.paymentStatus === PaymentStatus.PAID &&
        o.status !== OrderStatus.CANCELLED &&
        inPaidWindow(o),
    );

    const paidOnline = accepted.length + refused.length;
    const refuseRate =
      paidOnline > 0
        ? Math.round((refused.length / paidOnline) * 1000) / 10
        : 0;

    const staffMap = new Map<string, { name: string; count: number }>();
    for (const order of refused) {
      const id = order.refusedByUserId ?? 'unknown';
      const name = order.refusedByUser
        ? `${order.refusedByUser.firstName} ${order.refusedByUser.lastName}`.trim()
        : 'Unknown staff';
      const row = staffMap.get(id) ?? { name, count: 0 };
      row.count += 1;
      staffMap.set(id, row);
    }

    return {
      range: { from: from.toISOString(), to: to.toISOString() },
      sales: {
        paidOrders: paidForRevenue.length,
        revenue: Math.round(revenue * 100) / 100,
        byChannel: [...channelMap.entries()].map(([channel, row]) => ({
          channel,
          orders: row.orders,
          revenue: Math.round(row.revenue * 100) / 100,
        })),
      },
      online: {
        paidOnline,
        accepted: accepted.length,
        refused: refused.length,
        refuseRate,
        refusalsByStaff: [...staffMap.entries()]
          .map(([userId, row]) => ({
            userId,
            name: row.name,
            count: row.count,
          }))
          .sort((a, b) => b.count - a.count),
      },
    };
  }
}
