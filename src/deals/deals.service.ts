import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Deal, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDealDto } from './dto/create-deal.dto';
import { UpdateDealDto } from './dto/update-deal.dto';

@Injectable()
export class DealsService {
  constructor(private readonly prisma: PrismaService) {}

  findActiveDeals(): Promise<Deal[]> {
    const now = new Date();

    return this.prisma.deal.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
          { OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
        ],
      },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    });
  }

  findAllForAdmin(): Promise<Deal[]> {
    return this.prisma.deal.findMany({
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    });
  }

  async create(dto: CreateDealDto): Promise<Deal> {
    const slug = dto.slug.trim().toLowerCase();
    const promoCode = dto.promoCode?.trim().toUpperCase() || null;

    await this.ensureUniqueSlug(slug);
    if (promoCode) {
      await this.ensureUniquePromoCode(promoCode);
    }

    this.validateDiscount(dto.discountType, dto.discountValue);

    return this.prisma.deal.create({
      data: this.buildCreateData(dto, slug, promoCode),
    });
  }

  async update(id: string, dto: UpdateDealDto): Promise<Deal> {
    const deal = await this.findById(id);

    const nextSlug = dto.slug?.trim().toLowerCase();
    const nextPromoCode =
      dto.promoCode === undefined
        ? undefined
        : dto.promoCode.trim()
          ? dto.promoCode.trim().toUpperCase()
          : null;

    if (nextSlug && nextSlug !== deal.slug) {
      await this.ensureUniqueSlug(nextSlug, id);
    }

    if (nextPromoCode && nextPromoCode !== deal.promoCode) {
      await this.ensureUniquePromoCode(nextPromoCode, id);
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

  async remove(id: string): Promise<void> {
    await this.findById(id);
    await this.prisma.deal.delete({ where: { id } });
  }

  private buildCreateData(
    dto: CreateDealDto,
    slug: string,
    promoCode: string | null,
  ): Prisma.DealCreateInput {
    return {
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

  private async findById(id: string): Promise<Deal> {
    const deal = await this.prisma.deal.findUnique({ where: { id } });

    if (!deal) {
      throw new NotFoundException(`Deal "${id}" not found.`);
    }

    return deal;
  }

  private async ensureUniqueSlug(slug: string, excludeId?: string): Promise<void> {
    const existing = await this.prisma.deal.findUnique({ where: { slug } });

    if (existing && existing.id !== excludeId) {
      throw new ConflictException(`Deal "${slug}" already exists.`);
    }
  }

  private async ensureUniquePromoCode(
    promoCode: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.prisma.deal.findUnique({
      where: { promoCode },
    });

    if (existing && existing.id !== excludeId) {
      throw new ConflictException(`Promo code "${promoCode}" is already in use.`);
    }
  }
}
