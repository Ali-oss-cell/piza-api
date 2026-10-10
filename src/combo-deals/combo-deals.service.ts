import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ComboSlotSourceType, Prisma } from '@prisma/client';
import { BrandsService } from '../brands/brands.service';
import { PrismaService } from '../prisma/prisma.service';
import { ComboDealSlotDto } from './dto/combo-deal-slot.dto';
import { CreateComboDealDto } from './dto/create-combo-deal.dto';
import { UpdateComboDealDto } from './dto/update-combo-deal.dto';

const slotInclude = {
  menuItem: {
    select: {
      id: true,
      name: true,
      slug: true,
      categorySlug: true,
      price: true,
      imageUrl: true,
      sizeOptions: true,
      sizePricing: true,
      isActive: true,
    },
  },
} as const;

const dealInclude = {
  slots: {
    include: slotInclude,
    orderBy: { sortOrder: 'asc' as const },
  },
};

@Injectable()
export class ComboDealsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandsService: BrandsService,
  ) {}

  async findActive(brandSlug?: string) {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const now = new Date();

    return this.prisma.comboDeal.findMany({
      where: {
        brandId,
        isActive: true,
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
          { OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
        ],
      },
      include: dealInclude,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findAllForAdmin(brandSlug?: string) {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    return this.prisma.comboDeal.findMany({
      where: { brandId },
      include: dealInclude,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string, brandSlug?: string) {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const deal = await this.prisma.comboDeal.findFirst({
      where: { id, brandId },
      include: dealInclude,
    });
    if (!deal) {
      throw new NotFoundException('Combo deal not found');
    }
    return deal;
  }

  async create(dto: CreateComboDealDto, brandSlug?: string) {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    await this.validateSlots(dto.slots, brandId);

    try {
      return await this.prisma.comboDeal.create({
        data: {
          brandId,
          slug: dto.slug.trim().toLowerCase(),
          name: dto.name.trim(),
          description: dto.description?.trim() ?? '',
          imageUrl: dto.imageUrl,
          imageAlt: dto.imageAlt,
          bundlePrice: dto.bundlePrice,
          sortOrder: dto.sortOrder ?? 0,
          isActive: dto.isActive ?? true,
          validFrom: dto.validFrom ? new Date(dto.validFrom) : null,
          validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
          slots: {
            create: dto.slots.map((slot, index) => this.toSlotCreate(slot, index)),
          },
        },
        include: dealInclude,
      });
    } catch (error) {
      this.rethrowUnique(error);
      throw error;
    }
  }

  async update(id: string, dto: UpdateComboDealDto, brandSlug?: string) {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const existing = await this.prisma.comboDeal.findFirst({
      where: { id, brandId },
    });
    if (!existing) {
      throw new NotFoundException('Combo deal not found');
    }

    if (dto.slots) {
      await this.validateSlots(dto.slots, brandId);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dto.slots) {
          await tx.comboDealSlot.deleteMany({ where: { comboDealId: id } });
        }

        return tx.comboDeal.update({
          where: { id },
          data: {
            ...(dto.slug !== undefined
              ? { slug: dto.slug.trim().toLowerCase() }
              : {}),
            ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
            ...(dto.description !== undefined
              ? { description: dto.description.trim() }
              : {}),
            ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
            ...(dto.imageAlt !== undefined ? { imageAlt: dto.imageAlt } : {}),
            ...(dto.bundlePrice !== undefined
              ? { bundlePrice: dto.bundlePrice }
              : {}),
            ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
            ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
            ...(dto.validFrom !== undefined
              ? { validFrom: dto.validFrom ? new Date(dto.validFrom) : null }
              : {}),
            ...(dto.validUntil !== undefined
              ? { validUntil: dto.validUntil ? new Date(dto.validUntil) : null }
              : {}),
            ...(dto.slots
              ? {
                  slots: {
                    create: dto.slots.map((slot, index) =>
                      this.toSlotCreate(slot, index),
                    ),
                  },
                }
              : {}),
          },
          include: dealInclude,
        });
      });
    } catch (error) {
      this.rethrowUnique(error);
      throw error;
    }
  }

  async remove(id: string, brandSlug?: string) {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const existing = await this.prisma.comboDeal.findFirst({
      where: { id, brandId },
    });
    if (!existing) {
      throw new NotFoundException('Combo deal not found');
    }
    await this.prisma.comboDeal.delete({ where: { id } });
    return { ok: true };
  }

  private toSlotCreate(
    slot: ComboDealSlotDto,
    index: number,
  ): Prisma.ComboDealSlotCreateWithoutComboDealInput {
    const menuItemId =
      slot.sourceType === ComboSlotSourceType.ITEM
        ? slot.menuItemId
        : undefined;

    return {
      label: slot.label.trim(),
      sortOrder: slot.sortOrder ?? index,
      quantity: slot.quantity ?? 1,
      sourceType: slot.sourceType,
      categorySlug:
        slot.sourceType === ComboSlotSourceType.CATEGORY
          ? slot.categorySlug?.trim() ?? null
          : null,
      ...(menuItemId
        ? { menuItem: { connect: { id: menuItemId } } }
        : {}),
      allowedSizes: slot.allowedSizes?.length
        ? (slot.allowedSizes as Prisma.InputJsonValue)
        : Prisma.JsonNull,
      allowModifiers: slot.allowModifiers ?? true,
    };
  }

  private async validateSlots(slots: ComboDealSlotDto[], brandId: string) {
    for (const slot of slots) {
      if (slot.sourceType === ComboSlotSourceType.CATEGORY) {
        if (!slot.categorySlug?.trim()) {
          throw new BadRequestException(
            `Slot "${slot.label}" requires a categorySlug`,
          );
        }
        const category = await this.prisma.menuCategory.findFirst({
          where: { brandId, slug: slot.categorySlug.trim() },
        });
        if (!category) {
          throw new BadRequestException(
            `Category not found: ${slot.categorySlug}`,
          );
        }
      } else if (slot.sourceType === ComboSlotSourceType.ITEM) {
        if (!slot.menuItemId) {
          throw new BadRequestException(
            `Slot "${slot.label}" requires a menuItemId`,
          );
        }
        const item = await this.prisma.menuItem.findFirst({
          where: { id: slot.menuItemId, brandId },
        });
        if (!item) {
          throw new BadRequestException(
            `Menu item not found for slot "${slot.label}"`,
          );
        }
      } else {
        throw new BadRequestException(`Invalid sourceType for slot "${slot.label}"`);
      }
    }
  }

  private rethrowUnique(error: unknown): void {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('A combo deal with this slug already exists');
    }
  }
}
