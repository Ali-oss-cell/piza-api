import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Deal, Prisma } from '@prisma/client';
import { BrandsService } from '../brands/brands.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDealDto } from './dto/create-deal.dto';
import { UpdateDealDto } from './dto/update-deal.dto';

@Injectable()
export class DealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandsService: BrandsService,
  ) {}

  async findActiveDeals(brandSlug?: string): Promise<Deal[]> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const now = new Date();

    return this.prisma.deal.findMany({
      where: {
        brandId,
        isActive: true,
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
          { OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
        ],
      },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    });
  }

  async findAllForAdmin(brandSlug?: string): Promise<Deal[]> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    return this.prisma.deal.findMany({
      where: { brandId },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    });
  }

  async create(dto: CreateDealDto, brandSlug?: string): Promise<Deal> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const slug = dto.slug.trim().toLowerCase();
    const promoCode = dto.promoCode?.trim().toUpperCase() || null;

    await this.ensureUniqueSlug(brandId, slug);
    if (promoCode) {
      await this.ensureUniquePromoCode(brandId, promoCode);
    }

    this.validateDiscount(dto.discountType, dto.discountValue);

    return this.prisma.deal.create({
      data: this.buildCreateData(dto, brandId, slug, promoCode),
    });
  }

  async update(id: string, dto: UpdateDealDto, brandSlug?: string): Promise<Deal> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const deal = await this.findById(id, brandId);

    const nextSlug = dto.slug?.trim().toLowerCase();
    const nextPromoCode =
      dto.promoCode === undefined
        ? undefined
        : dto.promoCode.trim()
          ? dto.promoCode.trim().toUpperCase()
          : null;

    if (nextSlug && nextSlug !== deal.slug) {
      await this.ensureUniqueSlug(brandId, nextSlug, id);
    }

    if (nextPromoCode && nextPromoCode !== deal.promoCode) {
      await this.ensureUniquePromoCode(brandId, nextPromoCode, id);
    }

    const discountType = dto.discountType ?? deal.discountType;
    const discountValue =
      dto.discountValue !== undefined ? dto.discountValue : Number(deal.discountValue);

    this.validateDiscount(discountType, discountValue);

    return this.prisma.deal.update({
      where: { id },
      data: {
        ...(nextSlug ? { slug: nextSlug } : {}),
        ...(dto.title ? { title: dto.title.trim() } : {}),
        ...(dto.description ? { description: dto.description.trim() } : {}),
        ...(dto.badgeLabel !== undefined
          ? { badgeLabel: dto.badgeLabel.trim() || null }
          : {}),
        ...(dto.discountType ? { discountType: dto.discountType } : {}),
        ...(dto.discountValue !== undefined ? { discountValue: dto.discountValue } : {}),
        ...(nextPromoCode !== undefined ? { promoCode: nextPromoCode } : {}),
        ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl || null } : {}),
        ...(dto.imageAlt !== undefined ? { imageAlt: dto.imageAlt.trim() || null } : {}),
        ...(dto.termsNote !== undefined ? { termsNote: dto.termsNote.trim() || null } : {}),
        ...(dto.ctaLabel ? { ctaLabel: dto.ctaLabel.trim() } : {}),
        ...(dto.ctaHref ? { ctaHref: dto.ctaHref.trim() } : {}),
        ...(dto.validFrom !== undefined
          ? { validFrom: dto.validFrom ? new Date(dto.validFrom) : null }
          : {}),
        ...(dto.validUntil !== undefined
          ? { validUntil: dto.validUntil ? new Date(dto.validUntil) : null }
          : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.isFeatured !== undefined ? { isFeatured: dto.isFeatured } : {}),
      },
    });
  }

  async remove(id: string, brandSlug?: string): Promise<void> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    await this.findById(id, brandId);
    await this.prisma.deal.delete({ where: { id } });
  }

  private buildCreateData(
    dto: CreateDealDto,
    brandId: string,
    slug: string,
    promoCode: string | null,
  ): Prisma.DealCreateInput {
    return {
      brand: { connect: { id: brandId } },
      slug,
      title: dto.title.trim(),
      description: dto.description.trim(),
      badgeLabel: dto.badgeLabel?.trim() || null,
      discountType: dto.discountType,
      discountValue: dto.discountValue,
      promoCode,
      imageUrl: dto.imageUrl || null,
      imageAlt: dto.imageAlt?.trim() || null,
      termsNote: dto.termsNote?.trim() || null,
      ctaLabel: dto.ctaLabel?.trim() || 'Order Now',
      ctaHref: dto.ctaHref?.trim() || '/',
      validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
      validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
      sortOrder: dto.sortOrder ?? 0,
      isActive: dto.isActive ?? true,
      isFeatured: dto.isFeatured ?? false,
    };
  }

  private validateDiscount(
    discountType: CreateDealDto['discountType'],
    discountValue: number,
  ): void {
    if (discountType === 'PERCENTAGE' && discountValue > 100) {
      throw new BadRequestException('Percentage discount cannot exceed 100.');
    }
  }

  private async findById(id: string, brandId: string): Promise<Deal> {
    const deal = await this.prisma.deal.findFirst({ where: { id, brandId } });

    if (!deal) {
      throw new NotFoundException(`Deal "${id}" not found.`);
    }

    return deal;
  }

  private async ensureUniqueSlug(
    brandId: string,
    slug: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.prisma.deal.findUnique({
      where: { brandId_slug: { brandId, slug } },
    });

    if (existing && existing.id !== excludeId) {
      throw new ConflictException(`Deal "${slug}" already exists.`);
    }
  }

  private async ensureUniquePromoCode(
    brandId: string,
    promoCode: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.prisma.deal.findFirst({
      where: { brandId, promoCode },
    });

    if (existing && existing.id !== excludeId) {
      throw new ConflictException(`Promo code "${promoCode}" is already in use.`);
    }
  }
}
