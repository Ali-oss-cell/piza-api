import { Injectable } from '@nestjs/common';
import { BrandsService } from '../brands/brands.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateStoreSettingsDto } from './dto/update-store-settings.dto';

export type StoreSettingsResponse = {
  id: string;
  storeName: string;
  tagline: string | null;
  logoUrl: string | null;
  primaryColor: string | null;
  deliveryFee: unknown;
  minOrderAmount: unknown;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  openingHours: unknown;
  updatedAt: Date;
};

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandsService: BrandsService,
  ) {}

  async findStoreSettings(brandSlug?: string): Promise<StoreSettingsResponse> {
    const brandWithLocation = await this.brandsService.getBrandWithDefaultLocation(brandSlug);
    const location = brandWithLocation.locations[0];

    return {
      id: location.id,
      storeName: brandWithLocation.name,
      tagline: brandWithLocation.tagline,
      logoUrl: brandWithLocation.logoUrl,
      primaryColor: brandWithLocation.primaryColor,
      deliveryFee: location.deliveryFee,
      minOrderAmount: location.minOrderAmount,
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

    if (
      dto.storeName !== undefined ||
      dto.tagline !== undefined ||
      dto.logoUrl !== undefined ||
      dto.primaryColor !== undefined
    ) {
      await this.prisma.brand.update({
        where: { id: brandWithLocation.id },
        data: {
          ...(dto.storeName !== undefined ? { name: dto.storeName.trim() } : {}),
          ...(dto.tagline !== undefined ? { tagline: dto.tagline.trim() || null } : {}),
          ...(dto.logoUrl !== undefined
            ? { logoUrl: dto.logoUrl?.trim() || null }
            : {}),
          ...(dto.primaryColor !== undefined
            ? { primaryColor: dto.primaryColor?.trim() || null }
            : {}),
        },
      });
    }

    const updatedLocation = await this.prisma.location.update({
      where: { id: location.id },
      data: {
        ...(dto.deliveryFee !== undefined ? { deliveryFee: dto.deliveryFee } : {}),
        ...(dto.minOrderAmount !== undefined ? { minOrderAmount: dto.minOrderAmount } : {}),
        ...(dto.contactEmail !== undefined
          ? { email: dto.contactEmail.trim() || null }
          : {}),
        ...(dto.contactPhone !== undefined
          ? { phone: dto.contactPhone.trim() || null }
          : {}),
        ...(dto.address !== undefined ? { address: dto.address.trim() || null } : {}),
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
      primaryColor: brand.primaryColor,
      deliveryFee: updatedLocation.deliveryFee,
      minOrderAmount: updatedLocation.minOrderAmount,
      contactEmail: updatedLocation.email,
      contactPhone: updatedLocation.phone,
      address: updatedLocation.address,
      openingHours: updatedLocation.openingHours,
      updatedAt: updatedLocation.updatedAt,
    };
  }
}
