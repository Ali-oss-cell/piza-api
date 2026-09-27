import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MenuCategory, MenuItem, Prisma } from '@prisma/client';
import { BrandsService } from '../brands/brands.service';
import { CustomizationsService } from '../customizations/customizations.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMenuCategoryDto } from './dto/create-menu-category.dto';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuCategoryDto } from './dto/update-menu-category.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import {
  createDefaultSizeOptions,
  deriveBasePrice,
  normalizeSizeOptions,
  toLegacySizePricing,
  type SizeOptions,
} from './size-options.util';

function isBrokenLegacyPricing(
  pricing: Record<'small' | 'large' | 'family', number> | null | undefined,
): boolean {
  if (!pricing) {
    return true;
  }
  return pricing.small <= 0 && pricing.large <= 0 && pricing.family <= 0;
}

function normalizeLegacyPricing(
  value: unknown,
  fallbackPrice: number,
): Record<'small' | 'large' | 'family', number> | undefined {
  if (!value || typeof value !== 'object') {
    return fallbackPrice > 0
      ? { small: fallbackPrice, large: fallbackPrice, family: fallbackPrice }
      : undefined;
  }
  const raw = value as Record<string, number | undefined>;
  const pricing = {
    small: Number(raw.small ?? 0),
    large: Number(raw.large ?? 0),
    family: Number(raw.family ?? 0),
  };
  if (isBrokenLegacyPricing(pricing) && fallbackPrice > 0) {
    return { small: fallbackPrice, large: fallbackPrice, family: fallbackPrice };
  }
  return {
    small: pricing.small > 0 ? pricing.small : fallbackPrice,
    large: pricing.large > 0 ? pricing.large : fallbackPrice,
    family: pricing.family > 0 ? pricing.family : fallbackPrice,
  };
}

@Injectable()
export class MenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customizationsService: CustomizationsService,
    private readonly brandsService: BrandsService,
  ) {}

  async findAll(brandSlug?: string): Promise<MenuItem[]> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const items = await this.prisma.menuItem.findMany({
      where: { brandId, isActive: true },
      orderBy: [{ categorySlug: 'asc' }, { number: 'asc' }],
    });

    return Promise.all(items.map((item) => this.mapPublicItem(item)));
  }

  async findAllForAdmin(brandSlug?: string): Promise<MenuItem[]> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    return this.prisma.menuItem.findMany({
      where: { brandId },
      orderBy: [{ categorySlug: 'asc' }, { number: 'asc' }],
    });
  }

  async findAllCategories(brandSlug?: string): Promise<MenuCategory[]> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    return this.prisma.menuCategory.findMany({
      where: { brandId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  async findAllCategoriesForAdmin(brandSlug?: string): Promise<MenuCategory[]> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    return this.prisma.menuCategory.findMany({
      where: { brandId },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  async findOne(id: string): Promise<MenuItem & { brandSlug: string }> {
    const item = await this.prisma.menuItem.findUnique({
      where: { id },
      include: { brand: { select: { slug: true } } },
    });

    if (!item || !item.isActive) {
      throw new NotFoundException('Menu item not found');
    }

    const mapped = await this.mapPublicItem(item);
    return { ...mapped, brandSlug: item.brand.slug };
  }

  async findBySlug(slug: string, brandSlug?: string): Promise<MenuItem> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const item = await this.prisma.menuItem.findUnique({
      where: { brandId_slug: { brandId, slug } },
    });

    if (!item || !item.isActive) {
      throw new NotFoundException('Menu item not found');
    }

    return this.mapPublicItem(item);
  }

  async create(dto: CreateMenuItemDto, brandSlug?: string): Promise<MenuItem> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    return this.prisma.menuItem.create({
      data: this.buildCreateInput(dto, brandId),
    });
  }

  async update(
    id: string,
    dto: UpdateMenuItemDto,
    brandSlug?: string,
    options?: { bypassLock?: boolean },
  ): Promise<MenuItem> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const existing = await this.ensureExists(id, brandId);
    if (existing.isFranchiseLocked && !options?.bypassLock) {
      throw new ForbiddenException(
        'This menu item is franchise-locked and cannot be edited by store admins.',
      );
    }

    return this.prisma.menuItem.update({
      where: { id },
      data: this.buildUpdateInput(dto, brandId, options?.bypassLock === true),
    });
  }

  async remove(
    id: string,
    brandSlug?: string,
    options?: { bypassLock?: boolean },
  ): Promise<MenuItem> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const item = await this.ensureExists(id, brandId);
    if (item.isFranchiseLocked && !options?.bypassLock) {
      throw new ForbiddenException(
        'This menu item is franchise-locked and cannot be removed.',
      );
    }

    return this.prisma.menuItem.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async createCategory(
    dto: CreateMenuCategoryDto,
    brandSlug?: string,
  ): Promise<MenuCategory> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const slug = dto.slug.trim().toLowerCase();

    const existing = await this.prisma.menuCategory.findUnique({
      where: { brandId_slug: { brandId, slug } },
    });

    if (existing) {
      throw new ConflictException(`Category "${slug}" already exists.`);
    }

    return this.prisma.menuCategory.create({
      data: {
        brandId,
        slug,
        label: dto.label.trim(),
        sortOrder: dto.sortOrder ?? 0,
        supportsSizeOptions: dto.supportsSizeOptions ?? false,
        supportsExtras: dto.supportsExtras ?? false,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateCategory(
    slug: string,
    dto: UpdateMenuCategoryDto,
    brandSlug?: string,
  ): Promise<MenuCategory> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const category = await this.prisma.menuCategory.findUnique({
      where: { brandId_slug: { brandId, slug } },
    });

    if (!category) {
      throw new NotFoundException(`Category "${slug}" not found.`);
    }

    const nextSlug = dto.slug?.trim().toLowerCase();

    if (nextSlug && nextSlug !== slug) {
      const conflict = await this.prisma.menuCategory.findUnique({
        where: { brandId_slug: { brandId, slug: nextSlug } },
      });

      if (conflict) {
        throw new ConflictException(`Category "${nextSlug}" already exists.`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.menuCategory.update({
        where: { brandId_slug: { brandId, slug } },
        data: {
          ...(nextSlug ? { slug: nextSlug } : {}),
          ...(dto.label ? { label: dto.label.trim() } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
          ...(dto.supportsSizeOptions !== undefined
            ? { supportsSizeOptions: dto.supportsSizeOptions }
            : {}),
          ...(dto.supportsExtras !== undefined
            ? { supportsExtras: dto.supportsExtras }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });

      if (nextSlug) {
        await tx.menuItem.updateMany({
          where: { brandId, categorySlug: slug },
          data: { categorySlug: nextSlug },
        });
      }

      return updated;
    });
  }

  async removeCategory(slug: string, brandSlug?: string): Promise<void> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const category = await this.prisma.menuCategory.findUnique({
      where: { brandId_slug: { brandId, slug } },
      include: { _count: { select: { items: true } } },
    });

    if (!category) {
      throw new NotFoundException(`Category "${slug}" not found.`);
    }

    if (category._count.items > 0) {
      throw new BadRequestException(
        'Remove or reassign menu items before deleting this category.',
      );
    }

    await this.prisma.menuCategory.delete({
      where: { brandId_slug: { brandId, slug } },
    });
  }

  private buildCreateInput(
    dto: CreateMenuItemDto,
    brandId: string,
  ): Prisma.MenuItemCreateInput {
    const sizeOptions = this.resolveSizeOptions(dto);
    const price = dto.price ?? (sizeOptions ? deriveBasePrice(sizeOptions) : dto.price);
    const categorySlug = dto.categorySlug.trim().toLowerCase();

    return {
      brand: { connect: { id: brandId } },
      slug: dto.slug,
      number: dto.number,
      name: dto.name,
      description: dto.description,
      price,
      category: { connect: { brandId_slug: { brandId, slug: categorySlug } } },
      imageUrl: dto.imageUrl,
      imageAlt: dto.imageAlt,
      imageBlurHash: dto.imageBlurHash,
      badges: dto.badges ?? [],
      priceNote: dto.priceNote,
      ingredients: dto.ingredients ?? [],
      sizeOptions: sizeOptions
        ? (sizeOptions as unknown as Prisma.InputJsonValue)
        : undefined,
      allowedToppingIds: dto.allowedToppingIds ?? [],
      isActive: dto.isActive ?? true,
    };
  }

  private buildUpdateInput(
    dto: UpdateMenuItemDto,
    brandId: string,
    allowLockChange = false,
  ): Prisma.MenuItemUpdateInput {
    const sizeOptions =
      dto.sizeOptions === null
        ? null
        : dto.sizeOptions
          ? normalizeSizeOptions(dto.sizeOptions) ??
            (dto.sizeOptions as unknown as SizeOptions)
          : undefined;

    return {
      slug: dto.slug,
      number: dto.number,
      name: dto.name,
      description: dto.description,
      price: dto.price,
      ...(dto.categorySlug
        ? {
            category: {
              connect: {
                brandId_slug: {
                  brandId,
                  slug: dto.categorySlug.trim().toLowerCase(),
                },
              },
            },
          }
        : {}),
      imageUrl: dto.imageUrl,
      imageAlt: dto.imageAlt,
      imageBlurHash: dto.imageBlurHash,
      badges: dto.badges,
      priceNote: dto.priceNote,
      ingredients: dto.ingredients,
      sizeOptions:
        sizeOptions === null
          ? Prisma.JsonNull
          : sizeOptions
            ? (sizeOptions as unknown as Prisma.InputJsonValue)
            : undefined,
      sizePricing:
        sizeOptions === null
          ? Prisma.JsonNull
          : sizeOptions
            ? toLegacySizePricing(sizeOptions)
            : dto.sizePricing === null
              ? Prisma.JsonNull
              : dto.sizePricing,
      allowedToppingIds: dto.allowedToppingIds,
      isActive: dto.isActive,
      ...(allowLockChange && dto.isFranchiseLocked !== undefined
        ? { isFranchiseLocked: dto.isFranchiseLocked }
        : {}),
    };
  }

  private resolveSizeOptions(dto: CreateMenuItemDto): SizeOptions | undefined {
    if (dto.sizeOptions) {
      return normalizeSizeOptions(dto.sizeOptions) ?? (dto.sizeOptions as unknown as SizeOptions);
    }

    if (dto.sizePricing) {
      return createDefaultSizeOptions(
        Number(dto.sizePricing.small ?? dto.price),
        Number(dto.sizePricing.large ?? dto.price),
        Number(dto.sizePricing.family ?? dto.price),
      );
    }

    return undefined;
  }

  private async mapPublicItem(item: MenuItem): Promise<MenuItem> {
    const ingredients = await this.customizationsService.resolveIngredientLabels(
      item.ingredients,
      item.brandId,
    );

    const normalized = normalizeSizeOptions(item.sizeOptions);
    const sizePricing =
      normalized && !isBrokenLegacyPricing(toLegacySizePricing(normalized))
        ? toLegacySizePricing(normalized)
        : normalizeLegacyPricing(item.sizePricing, Number(item.price));

    return {
      ...item,
      ingredients,
      ...(normalized ? { sizeOptions: normalized as unknown as typeof item.sizeOptions } : {}),
      ...(sizePricing ? { sizePricing: sizePricing as unknown as typeof item.sizePricing } : {}),
    };
  }

  private async ensureExists(id: string, brandId: string): Promise<MenuItem> {
    const item = await this.prisma.menuItem.findFirst({
      where: { id, brandId },
    });

    if (!item) {
      throw new NotFoundException('Menu item not found');
    }

    return item;
  }
}
