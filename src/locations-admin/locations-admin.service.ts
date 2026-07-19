import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { DEFAULT_OPENING_HOURS } from '../orders/opening-hours.types';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLocationDto } from './dto/create-location.dto';
import { UpdateLocationDto } from './dto/update-location.dto';

@Injectable()
export class LocationsAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async list(brandSlug: string): Promise<unknown[]> {
    const brand = await this.resolveBrand(brandSlug);
    return this.prisma.location.findMany({
      where: { brandId: brand.id },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async create(
    dto: CreateLocationDto,
    actor: AuthenticatedUser,
  ): Promise<unknown> {
    const brand = await this.resolveBrand(dto.brandSlug);
    const slug = this.slugify(dto.slug ?? dto.suburb ?? dto.name ?? 'main');

    const existing = await this.prisma.location.findUnique({
      where: { brandId_slug: { brandId: brand.id, slug } },
    });
    if (existing) {
      throw new ConflictException(
        `Location "${slug}" already exists for this store.`,
      );
    }

    const location = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault === true) {
        await tx.location.updateMany({
          where: { brandId: brand.id, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.location.create({
        data: {
          brandId: brand.id,
          slug,
          name: dto.name.trim(),
          suburb: dto.suburb?.trim() || null,
          address: dto.address?.trim() || null,
          phone: dto.phone?.trim() || null,
          email: dto.email?.trim() || null,
          deliveryFee: dto.deliveryFee ?? 5,
          minOrderAmount: dto.minOrderAmount ?? 0,
          openingHours: DEFAULT_OPENING_HOURS as unknown as Prisma.InputJsonValue,
          isActive: dto.isActive ?? true,
          isDefault: dto.isDefault ?? false,
        },
      });
    });

    await this.auditService.log(
      actor.id,
      brand.id,
      AuditAction.LOCATION_CREATED,
      `Location "${location.name}" created for ${brand.slug}`,
      { locationId: location.id, slug: location.slug },
    );

    return location;
  }

  async update(
    locationId: string,
    dto: UpdateLocationDto,
    actor: AuthenticatedUser,
  ): Promise<unknown> {
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
    });
    if (!location) {
      throw new NotFoundException('Location not found.');
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.isDefault === true) {
        await tx.location.updateMany({
          where: {
            brandId: location.brandId,
            isDefault: true,
            id: { not: locationId },
          },
          data: { isDefault: false },
        });
      }
      return tx.location.update({
        where: { id: locationId },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.suburb !== undefined
            ? { suburb: dto.suburb.trim() || null }
            : {}),
          ...(dto.address !== undefined
            ? { address: dto.address.trim() || null }
            : {}),
          ...(dto.phone !== undefined
            ? { phone: dto.phone.trim() || null }
            : {}),
          ...(dto.email !== undefined
            ? { email: dto.email.trim() || null }
            : {}),
          ...(dto.deliveryFee !== undefined
            ? { deliveryFee: dto.deliveryFee }
            : {}),
          ...(dto.minOrderAmount !== undefined
            ? { minOrderAmount: dto.minOrderAmount }
            : {}),
          ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });
    });

    await this.auditService.log(
      actor.id,
      location.brandId,
      AuditAction.LOCATION_UPDATED,
      `Location "${updated.name}" updated`,
      { locationId, ...dto },
    );

    return updated;
  }

  async findBrandSlugForLocation(
    locationId: string,
  ): Promise<string | null> {
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
      include: { brand: { select: { slug: true } } },
    });
    return location?.brand.slug ?? null;
  }

  private async resolveBrand(brandSlug: string) {
    const slug = brandSlug.trim().toLowerCase();
    const brand = await this.prisma.brand.findUnique({ where: { slug } });
    if (!brand) {
      throw new NotFoundException(`Store "${slug}" not found.`);
    }
    return brand;
  }

  private slugify(value: string): string {
    return (
      value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 60) || 'main'
    );
  }
}
