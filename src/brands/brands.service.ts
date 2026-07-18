import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Brand, BrandStatus, Location, StoreMembershipRole } from '@prisma/client';
import { DEFAULT_BRAND_SLUG } from '../common/constants/brands';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStoreDto } from './dto/create-store.dto';

export type BrandWithDefaultLocation = Brand & {
  locations: Location[];
};

export type ResolvedStore = Brand & {
  pathPrefix: string | null;
  host: string | null;
  locations: Location[];
};

const STARTER_CATEGORIES = [
  { slug: 'mains', label: 'Mains', supportsSizeOptions: false, supportsExtras: true },
  { slug: 'sides', label: 'Sides', supportsSizeOptions: false, supportsExtras: false },
  { slug: 'drinks', label: 'Drinks', supportsSizeOptions: false, supportsExtras: false },
] as const;

@Injectable()
export class BrandsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<Brand[]> {
    return this.prisma.brand.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async resolveStore(params: {
    pathPrefix?: string;
    host?: string;
  }): Promise<ResolvedStore> {
    const pathPrefix = params.pathPrefix
      ? this.normalizeLookupPath(params.pathPrefix)
      : undefined;
    const host = params.host?.trim().toLowerCase() || undefined;

    if (!pathPrefix && !host) {
      throw new BadRequestException('Provide pathPrefix or host to resolve a store.');
    }

    const domain = await this.prisma.storeDomain.findFirst({
      where: {
        isActive: true,
        ...(host ? { host } : {}),
        ...(pathPrefix ? { pathPrefix } : {}),
        store: { isActive: true },
      },
      include: {
        store: {
          include: {
            locations: {
              where: { isActive: true },
              orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
              take: 1,
            },
          },
        },
      },
    });

    if (!domain) {
      throw new NotFoundException('Store not found for the given path or host.');
    }

    return {
      ...domain.store,
      pathPrefix: domain.pathPrefix,
      host: domain.host,
      locations: domain.store.locations,
    };
  }

  async createStore(dto: CreateStoreDto, creatorUserId?: string) {
    const slug = dto.slug.trim().toLowerCase();
    const pathPrefix = this.normalizePathPrefix(dto.pathPrefix ?? `/${slug}`);
    const host = dto.host?.trim().toLowerCase() || null;

    if (!dto.location?.name?.trim()) {
      throw new BadRequestException('location.name is required');
    }

    const existing = await this.prisma.brand.findUnique({ where: { slug } });
    if (existing) {
      throw new ConflictException(`Store slug "${slug}" is already taken.`);
    }

    if (pathPrefix) {
      const pathTaken = await this.prisma.storeDomain.findUnique({
        where: { pathPrefix },
      });
      if (pathTaken) {
        throw new ConflictException(`Path "${pathPrefix}" is already assigned.`);
      }
    }

    if (host) {
      const hostTaken = await this.prisma.storeDomain.findUnique({
        where: { host },
      });
      if (hostTaken) {
        throw new ConflictException(`Host "${host}" is already assigned.`);
      }
    }

    const locationSlug = this.slugify(dto.location.suburb || dto.location.name || 'main');

    return this.prisma.$transaction(async (tx) => {
      const store = await tx.brand.create({
        data: {
          slug,
          name: dto.name.trim(),
          tagline: dto.tagline?.trim() || null,
          logoUrl: dto.logoUrl?.trim() || null,
          logoDarkUrl: dto.logoDarkUrl?.trim() || null,
          primaryColor: dto.primaryColor?.trim() || null,
          isActive: true,
          status: BrandStatus.LIVE,
        },
      });

      const location = await tx.location.create({
        data: {
          brandId: store.id,
          slug: locationSlug,
          name: dto.location.name.trim(),
          suburb: dto.location.suburb?.trim() || null,
          address: dto.location.address?.trim() || null,
          phone: dto.location.phone?.trim() || null,
          email: dto.location.email?.trim() || null,
          deliveryFee: dto.location.deliveryFee ?? 5,
          minOrderAmount: dto.location.minOrderAmount ?? 0,
          isActive: true,
          isDefault: true,
        },
      });

      await tx.storePaymentSettings.create({
        data: {
          storeId: store.id,
          provider: 'CASH',
          cashEnabled: true,
          cardTerminalEnabled: false,
          cardOnlineEnabled: false,
        },
      });

      await tx.storeDomain.create({
        data: {
          storeId: store.id,
          locationId: location.id,
          host,
          pathPrefix,
          isPrimary: true,
          isActive: true,
        },
      });

      if (dto.createStarterCategories !== false) {
        for (const [index, category] of STARTER_CATEGORIES.entries()) {
          await tx.menuCategory.create({
            data: {
              brandId: store.id,
              slug: category.slug,
              label: category.label,
              sortOrder: index,
              supportsSizeOptions: category.supportsSizeOptions,
              supportsExtras: category.supportsExtras,
              isActive: true,
            },
          });
        }
      }

      if (creatorUserId) {
        await tx.userStore.upsert({
          where: {
            userId_storeId: {
              userId: creatorUserId,
              storeId: store.id,
            },
          },
          update: {
            role: StoreMembershipRole.STORE_ADMIN,
            isActive: true,
          },
          create: {
            userId: creatorUserId,
            storeId: store.id,
            role: StoreMembershipRole.STORE_ADMIN,
            isActive: true,
          },
        });
      }

      return tx.brand.findUniqueOrThrow({
        where: { id: store.id },
        include: {
          locations: true,
          domains: true,
          paymentSettings: true,
          menuCategories: { orderBy: { sortOrder: 'asc' } },
        },
      });
    });
  }

  async assignStoreMembership(
    userId: string,
    storeId: string,
    role: StoreMembershipRole,
  ) {
    return this.prisma.userStore.upsert({
      where: {
        userId_storeId: { userId, storeId },
      },
      update: { role, isActive: true },
      create: { userId, storeId, role, isActive: true },
    });
  }

  async updateStoreStatus(slug: string, isActive: boolean) {
    const brandSlug = slug.trim().toLowerCase();
    const brand = await this.prisma.brand.findUnique({ where: { slug: brandSlug } });

    if (!brand) {
      throw new NotFoundException(`Brand "${brandSlug}" not found.`);
    }

    return this.prisma.brand.update({
      where: { slug: brandSlug },
      data: { isActive },
    });
  }

  async listDomains(slug: string) {
    const brand = await this.resolveBrand(slug);
    return this.prisma.storeDomain.findMany({
      where: { storeId: brand.id },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        host: true,
        pathPrefix: true,
        isPrimary: true,
        isActive: true,
        locationId: true,
      },
    });
  }

  async resolveBrandId(slug?: string): Promise<string> {
    const brand = await this.resolveBrand(slug);
    return brand.id;
  }

  async resolveBrand(slug?: string): Promise<Brand> {
    const brandSlug = slug?.trim().toLowerCase() || DEFAULT_BRAND_SLUG;
    const brand = await this.prisma.brand.findUnique({
      where: { slug: brandSlug },
    });

    if (!brand || !brand.isActive) {
      throw new NotFoundException(`Brand "${brandSlug}" not found.`);
    }

    return brand;
  }

  async resolveDefaultLocation(slug?: string): Promise<Location> {
    const brand = await this.getBrandWithDefaultLocation(slug);
    const location = brand.locations[0];

    if (!location) {
      throw new NotFoundException('No default location configured for this brand.');
    }

    return location;
  }

  async getBrandWithDefaultLocation(slug?: string): Promise<BrandWithDefaultLocation> {
    const brandSlug = slug?.trim().toLowerCase() || DEFAULT_BRAND_SLUG;
    const brand = await this.prisma.brand.findUnique({
      where: { slug: brandSlug },
      include: {
        locations: {
          where: { isActive: true },
          orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
          take: 1,
        },
      },
    });

    if (!brand || !brand.isActive) {
      throw new NotFoundException(`Brand "${brandSlug}" not found.`);
    }

    return brand;
  }

  private normalizePathPrefix(value: string): string {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed || trimmed === '/') {
      throw new BadRequestException('pathPrefix must be a non-root path like /ninja');
    }
    const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return withSlash.replace(/\/+$/, '') || withSlash;
  }

  private normalizeLookupPath(value: string): string {
    const trimmed = value.trim().toLowerCase();
    if (!trimmed || trimmed === '/') {
      return '/';
    }
    const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return withSlash.replace(/\/+$/, '') || withSlash;
  }

  private slugify(value: string): string {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 60) || 'main';
  }
}
