import { Injectable, NotFoundException } from '@nestjs/common';
import { Brand, Location } from '@prisma/client';
import { DEFAULT_BRAND_SLUG } from '../common/constants/brands';
import { PrismaService } from '../prisma/prisma.service';

export type BrandWithDefaultLocation = Brand & {
  locations: Location[];
};

@Injectable()
export class BrandsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<Brand[]> {
    return this.prisma.brand.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
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
}
