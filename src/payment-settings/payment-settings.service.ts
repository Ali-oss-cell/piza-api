import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditAction, StorePaymentProvider } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditService } from '../audit/audit.service';
import { BrandsService } from '../brands/brands.service';
import {
  decryptLinklySecret,
  encryptLinklySecret,
} from '../payments/linkly-crypto';
import { LinklyService } from '../payments/linkly.service';
import { PrismaService } from '../prisma/prisma.service';
import { PairLinklyDto } from './dto/pair-linkly.dto';
import { UpdatePaymentSettingsDto } from './dto/update-payment-settings.dto';

export type LocationLinklySummary = {
  id: string;
  slug: string;
  name: string;
  linklyPaired: boolean;
  linklyUsername: string | null;
  cardTerminalEnabled: boolean;
  provider: StorePaymentProvider;
};

export type PaymentSettingsResponse = {
  storeId: string;
  storeSlug: string;
  provider: StorePaymentProvider;
  cashEnabled: boolean;
  cardTerminalEnabled: boolean;
  cardOnlineEnabled: boolean;
  stripePublishableKey: string | null;
  hasStripeSecretRef: boolean;
  hasStripeWebhookSecretRef: boolean;
  linklyUsername: string | null;
  hasLinklySecretRef: boolean;
  linklyPaired: boolean;
  location: {
    id: string;
    slug: string;
    name: string;
    stripeTerminalLocationId: string | null;
    stripeTerminalReaderId: string | null;
  } | null;
  locations: LocationLinklySummary[];
};

@Injectable()
export class PaymentSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandsService: BrandsService,
    private readonly audit: AuditService,
    private readonly linkly: LinklyService,
    private readonly config: ConfigService,
  ) {}

  async getForStore(brandSlug?: string): Promise<PaymentSettingsResponse> {
    const brand = await this.brandsService.resolveBrand(brandSlug);
    const settings = await this.ensureSettings(brand.id);
    const location = await this.resolveLocation(brand.id);
    const locations = await this.listLocationSummaries(brand.id);

    return this.toResponse(brand.slug, settings, location, locations);
  }

  async updateForStore(
    dto: UpdatePaymentSettingsDto,
    brandSlug?: string,
  ): Promise<PaymentSettingsResponse> {
    const brand = await this.brandsService.resolveBrand(brandSlug);
    await this.ensureSettings(brand.id);

    const provider =
      dto.provider !== undefined
        ? dto.provider
        : dto.cardTerminalEnabled === true
          ? StorePaymentProvider.LINKLY
          : dto.cardTerminalEnabled === false && dto.cashEnabled === true
            ? StorePaymentProvider.CASH
            : undefined;

    const updated = await this.prisma.storePaymentSettings.update({
      where: { storeId: brand.id },
      data: {
        ...(provider !== undefined ? { provider } : {}),
        ...(dto.cashEnabled !== undefined ? { cashEnabled: dto.cashEnabled } : {}),
        ...(dto.cardTerminalEnabled !== undefined
          ? { cardTerminalEnabled: dto.cardTerminalEnabled }
          : {}),
        ...(dto.cardOnlineEnabled !== undefined
          ? { cardOnlineEnabled: dto.cardOnlineEnabled }
          : {}),
        ...(dto.stripePublishableKey !== undefined
          ? { stripePublishableKey: dto.stripePublishableKey?.trim() || null }
          : {}),
        ...(dto.stripeSecretKeyRef !== undefined
          ? { stripeSecretKeyRef: dto.stripeSecretKeyRef?.trim() || null }
          : {}),
        ...(dto.stripeWebhookSecretRef !== undefined
          ? {
              stripeWebhookSecretRef: dto.stripeWebhookSecretRef?.trim() || null,
            }
          : {}),
        ...(dto.linklyUsername !== undefined
          ? { linklyUsername: dto.linklyUsername?.trim() || null }
          : {}),
      },
    });

    let location = await this.resolveLocation(brand.id, dto.locationId);

    if (
      location &&
      (dto.stripeTerminalLocationId !== undefined ||
        dto.stripeTerminalReaderId !== undefined)
    ) {
      location = await this.prisma.location.update({
        where: { id: location.id },
        data: {
          ...(dto.stripeTerminalLocationId !== undefined
            ? {
                stripeTerminalLocationId:
                  dto.stripeTerminalLocationId?.trim() || null,
              }
            : {}),
          ...(dto.stripeTerminalReaderId !== undefined
            ? {
                stripeTerminalReaderId:
                  dto.stripeTerminalReaderId?.trim() || null,
              }
            : {}),
        },
      });
    }

    await this.audit.log(
      null,
      brand.id,
      AuditAction.PAYMENT_SETTINGS_UPDATED,
      `Updated payment settings for ${brand.slug}`,
      {
        provider: updated.provider,
        cashEnabled: updated.cashEnabled,
        cardTerminalEnabled: updated.cardTerminalEnabled,
        cardOnlineEnabled: updated.cardOnlineEnabled,
      },
    );

    const locations = await this.listLocationSummaries(brand.id);
    return this.toResponse(brand.slug, updated, location, locations);
  }

  async pairLinkly(
    dto: PairLinklyDto,
    brandSlug?: string,
  ): Promise<PaymentSettingsResponse> {
    const slug = brandSlug ?? dto.brandSlug;
    const brand = await this.brandsService.resolveBrand(slug);
    const settings = await this.ensureSettings(brand.id);

    const secret = await this.linkly.pair({
      username: dto.username.trim(),
      password: dto.password,
      pairCode: dto.pairCode.trim(),
    });

    const encrypted = encryptLinklySecret(this.config, secret);
    const locationId = dto.locationId?.trim();

    if (locationId) {
      const location = await this.resolveLocation(brand.id, locationId);
      if (!location) {
        throw new NotFoundException('Location not found for this store.');
      }

      const existing = await this.prisma.locationPaymentSettings.findUnique({
        where: { locationId: location.id },
      });
      const posId = existing?.linklyPosId || randomUUID();

      await this.prisma.locationPaymentSettings.upsert({
        where: { locationId: location.id },
        create: {
          locationId: location.id,
          linklyUsername: dto.username.trim(),
          linklyPairSecretEnc: encrypted,
          linklySecretRef: 'paired',
          linklyPosId: posId,
          provider: StorePaymentProvider.LINKLY,
          cardTerminalEnabled: true,
        },
        update: {
          linklyUsername: dto.username.trim(),
          linklyPairSecretEnc: encrypted,
          linklySecretRef: 'paired',
          linklyPosId: posId,
          provider: StorePaymentProvider.LINKLY,
          cardTerminalEnabled: true,
        },
      });

      // Keep brand card terminal enabled so POS methods can fall back cleanly.
      await this.prisma.storePaymentSettings.update({
        where: { storeId: brand.id },
        data: {
          provider: StorePaymentProvider.LINKLY,
          cardTerminalEnabled: true,
          cashEnabled: settings.cashEnabled,
        },
      });

      await this.audit.log(
        null,
        brand.id,
        AuditAction.PAYMENT_SETTINGS_UPDATED,
        `Linkly pinpad paired for ${brand.slug} location ${location.slug}`,
        { locationId: location.id, linklyUsername: dto.username.trim() },
      );
    } else {
      const posId = settings.linklyPosId || randomUUID();

      await this.prisma.storePaymentSettings.update({
        where: { storeId: brand.id },
        data: {
          linklyUsername: dto.username.trim(),
          linklyPairSecretEnc: encrypted,
          linklySecretRef: 'paired',
          linklyPosId: posId,
          provider: StorePaymentProvider.LINKLY,
          cardTerminalEnabled: true,
        },
      });

      await this.audit.log(
        null,
        brand.id,
        AuditAction.PAYMENT_SETTINGS_UPDATED,
        `Linkly pinpad paired for ${brand.slug}`,
        { linklyUsername: dto.username.trim() },
      );
    }

    return this.getForStore(brand.slug);
  }

  async unpairLinkly(
    brandSlug?: string,
    locationId?: string,
  ): Promise<PaymentSettingsResponse> {
    const brand = await this.brandsService.resolveBrand(brandSlug);
    await this.ensureSettings(brand.id);
    const locId = locationId?.trim();

    if (locId) {
      const location = await this.resolveLocation(brand.id, locId);
      if (!location) {
        throw new NotFoundException('Location not found for this store.');
      }

      await this.prisma.locationPaymentSettings.deleteMany({
        where: { locationId: location.id },
      });

      await this.audit.log(
        null,
        brand.id,
        AuditAction.PAYMENT_SETTINGS_UPDATED,
        `Linkly pinpad unpaired for ${brand.slug} location ${location.slug}`,
        { locationId: location.id },
      );
    } else {
      await this.prisma.storePaymentSettings.update({
        where: { storeId: brand.id },
        data: {
          linklyPairSecretEnc: null,
          linklySecretRef: null,
          cardTerminalEnabled: false,
          provider: StorePaymentProvider.CASH,
        },
      });

      await this.audit.log(
        null,
        brand.id,
        AuditAction.PAYMENT_SETTINGS_UPDATED,
        `Linkly pinpad unpaired for ${brand.slug}`,
        {},
      );
    }

    return this.getForStore(brand.slug);
  }

  async getLinklyCredentials(
    storeId: string,
    locationId?: string,
  ): Promise<{
    secret: string;
    posId: string;
    username: string | null;
  }> {
    if (locationId?.trim()) {
      const locSettings = await this.prisma.locationPaymentSettings.findUnique({
        where: { locationId: locationId.trim() },
      });
      if (locSettings?.linklyPairSecretEnc && locSettings.linklyPosId) {
        return {
          secret: decryptLinklySecret(
            this.config,
            locSettings.linklyPairSecretEnc,
          ),
          posId: locSettings.linklyPosId,
          username: locSettings.linklyUsername,
        };
      }
    }

    const settings = await this.ensureSettings(storeId);
    if (!settings.linklyPairSecretEnc || !settings.linklyPosId) {
      throw new BadRequestException(
        'Linkly pinpad is not paired for this store. Pair it in Payments settings.',
      );
    }

    return {
      secret: decryptLinklySecret(this.config, settings.linklyPairSecretEnc),
      posId: settings.linklyPosId,
      username: settings.linklyUsername,
    };
  }

  async getPosMethods(
    brandSlug?: string,
    locationId?: string,
  ): Promise<{
    cashEnabled: boolean;
    cardTerminalEnabled: boolean;
    provider: StorePaymentProvider;
    linklyPaired: boolean;
  }> {
    const brand = await this.brandsService.resolveBrand(brandSlug);
    const settings = await this.ensureSettings(brand.id);

    const locId = locationId?.trim();
    if (locId) {
      const locSettings = await this.prisma.locationPaymentSettings.findUnique({
        where: { locationId: locId },
      });
      if (locSettings?.linklyPairSecretEnc) {
        return {
          cashEnabled: settings.cashEnabled,
          cardTerminalEnabled: locSettings.cardTerminalEnabled,
          provider: locSettings.provider,
          linklyPaired: true,
        };
      }
    }

    return {
      cashEnabled: settings.cashEnabled,
      cardTerminalEnabled: settings.cardTerminalEnabled,
      provider: settings.provider,
      linklyPaired: Boolean(settings.linklyPairSecretEnc),
    };
  }

  async assertCashEnabled(storeId: string): Promise<void> {
    const settings = await this.ensureSettings(storeId);
    if (!settings.cashEnabled) {
      throw new BadRequestException('Cash payments are disabled for this store.');
    }
  }

  /**
   * Assert that card-terminal is enabled for the store (location override first).
   */
  async assertCardTerminalEnabled(
    storeId: string,
    locationId?: string,
  ): Promise<void> {
    if (locationId?.trim()) {
      const locSettings = await this.prisma.locationPaymentSettings.findUnique({
        where: { locationId: locationId.trim() },
      });
      if (locSettings?.linklyPairSecretEnc) {
        if (!locSettings.cardTerminalEnabled) {
          throw new BadRequestException(
            'Card terminal payments are disabled for this location.',
          );
        }
        return;
      }
    }

    const settings = await this.ensureSettings(storeId);
    if (!settings.cardTerminalEnabled) {
      throw new BadRequestException(
        'Card terminal payments are disabled for this store.',
      );
    }

    if (settings.provider === 'STRIPE') {
      if (!settings.stripeSecretKeyRef) {
        throw new BadRequestException(
          'Stripe is not configured for this store. Add a secret key in Advanced Settings → Stripe Terminal.',
        );
      }
      return;
    }

    if (!settings.linklyPairSecretEnc) {
      throw new BadRequestException(
        'Linkly pinpad is not paired for this store.',
      );
    }
  }

  /** Returns the active card-terminal provider for a store/location. */
  async getCardTerminalProvider(
    storeId: string,
    locationId?: string,
  ): Promise<StorePaymentProvider> {
    if (locationId?.trim()) {
      const locSettings = await this.prisma.locationPaymentSettings.findUnique({
        where: { locationId: locationId.trim() },
      });
      if (locSettings?.linklyPairSecretEnc) {
        return locSettings.provider;
      }
    }
    const settings = await this.ensureSettings(storeId);
    return settings.provider;
  }

  private async ensureSettings(storeId: string) {
    const existing = await this.prisma.storePaymentSettings.findUnique({
      where: { storeId },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.storePaymentSettings.create({
      data: {
        storeId,
        provider: StorePaymentProvider.CASH,
        cashEnabled: true,
        cardTerminalEnabled: false,
        cardOnlineEnabled: false,
      },
    });
  }

  private async resolveLocation(storeId: string, locationId?: string) {
    if (locationId) {
      const location = await this.prisma.location.findFirst({
        where: { id: locationId, brandId: storeId, isActive: true },
      });
      if (!location) {
        throw new NotFoundException('Location not found for this store.');
      }
      return location;
    }

    return this.prisma.location.findFirst({
      where: { brandId: storeId, isActive: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  private async listLocationSummaries(
    storeId: string,
  ): Promise<LocationLinklySummary[]> {
    const locations = await this.prisma.location.findMany({
      where: { brandId: storeId, isActive: true },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      include: { paymentSettings: true },
    });

    return locations.map((location) => {
      const loc = location.paymentSettings;
      return {
        id: location.id,
        slug: location.slug,
        name: location.name,
        linklyPaired: Boolean(loc?.linklyPairSecretEnc),
        linklyUsername: loc?.linklyUsername ?? null,
        cardTerminalEnabled: loc?.cardTerminalEnabled ?? false,
        provider: loc?.provider ?? StorePaymentProvider.LINKLY,
      };
    });
  }

  private toResponse(
    storeSlug: string,
    settings: {
      storeId: string;
      provider: StorePaymentProvider;
      cashEnabled: boolean;
      cardTerminalEnabled: boolean;
      cardOnlineEnabled: boolean;
      stripePublishableKey: string | null;
      stripeSecretKeyRef: string | null;
      stripeWebhookSecretRef: string | null;
      linklyUsername: string | null;
      linklySecretRef: string | null;
      linklyPairSecretEnc?: string | null;
    },
    location: {
      id: string;
      slug: string;
      name: string;
      stripeTerminalLocationId: string | null;
      stripeTerminalReaderId: string | null;
    } | null,
    locations: LocationLinklySummary[],
  ): PaymentSettingsResponse {
    const paired = Boolean(settings.linklyPairSecretEnc);
    return {
      storeId: settings.storeId,
      storeSlug,
      provider: settings.provider,
      cashEnabled: settings.cashEnabled,
      cardTerminalEnabled: settings.cardTerminalEnabled,
      cardOnlineEnabled: settings.cardOnlineEnabled,
      stripePublishableKey: settings.stripePublishableKey,
      hasStripeSecretRef: Boolean(settings.stripeSecretKeyRef),
      hasStripeWebhookSecretRef: Boolean(settings.stripeWebhookSecretRef),
      linklyUsername: settings.linklyUsername,
      hasLinklySecretRef: paired || Boolean(settings.linklySecretRef),
      linklyPaired: paired,
      location: location
        ? {
            id: location.id,
            slug: location.slug,
            name: location.name,
            stripeTerminalLocationId: location.stripeTerminalLocationId,
            stripeTerminalReaderId: location.stripeTerminalReaderId,
          }
        : null,
      locations,
    };
  }
}
