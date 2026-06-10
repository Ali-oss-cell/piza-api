import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MenuCategory, MenuItem, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CustomizationsService } from '../customizations/customizations.service';
import { CreateMenuCategoryDto } from './dto/create-menu-category.dto';
import { CreateMenuItemDto } from './dto/create-menu-item.dto';
import { UpdateMenuCategoryDto } from './dto/update-menu-category.dto';
import { UpdateMenuItemDto } from './dto/update-menu-item.dto';
import {
  createDefaultSizeOptions,
  deriveBasePrice,
  toLegacySizePricing,
  type SizeOptions,
} from './size-options.util';

@Injectable()
export class MenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customizationsService: CustomizationsService,
  ) {}

  async findAll(): Promise<MenuItem[]> {
    const items = await this.prisma.menuItem.findMany({
      where: { isActive: true },
      orderBy: [{ categorySlug: 'asc' }, { number: 'asc' }],
    });

    return Promise.all(items.map((item) => this.mapPublicItem(item)));
  }

  findAllForAdmin(): Promise<MenuItem[]> {
    return this.prisma.menuItem.findMany({
      orderBy: [{ categorySlug: 'asc' }, { number: 'asc' }],
    });
  }

  findAllCategories(): Promise<MenuCategory[]> {
    return this.prisma.menuCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  findAllCategoriesForAdmin(): Promise<MenuCategory[]> {
    return this.prisma.menuCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  async findOne(id: string): Promise<MenuItem> {
    const item = await this.prisma.menuItem.findUnique({ where: { id } });

    if (!item || !item.isActive) {
      throw new NotFoundException('Menu item not found');
    }

    return this.mapPublicItem(item);
  }

  async findBySlug(slug: string): Promise<MenuItem> {
    const item = await this.prisma.menuItem.findUnique({ where: { slug } });

    if (!item || !item.isActive) {
      throw new NotFoundException('Menu item not found');
    }

    return this.mapPublicItem(item);
  }

  create(dto: CreateMenuItemDto): Promise<MenuItem> {
    return this.prisma.menuItem.create({
      data: this.buildCreateInput(dto),
    });
  }

  async update(id: string, dto: UpdateMenuItemDto): Promise<MenuItem> {
    await this.ensureExists(id);

    return this.prisma.menuItem.update({
      where: { id },
      data: this.buildUpdateInput(dto),
    });
  }

  async remove(id: string): Promise<MenuItem> {
    await this.ensureExists(id);

    return this.prisma.menuItem.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async createCategory(dto: CreateMenuCategoryDto): Promise<MenuCategory> {
    const slug = dto.slug.trim().toLowerCase();

    const existing = await this.prisma.menuCategory.findUnique({
      where: { slug },
    });

    if (existing) {
      throw new ConflictException(`Category "${slug}" already exists.`);
    }

    return this.prisma.menuCategory.create({
      data: {
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
  ): Promise<MenuCategory> {
    const category = await this.prisma.menuCategory.findUnique({
      where: { slug },
    });

    if (!category) {
      throw new NotFoundException(`Category "${slug}" not found.`);
    }

    const nextSlug = dto.slug?.trim().toLowerCase();

    if (nextSlug && nextSlug !== slug) {
      const conflict = await this.prisma.menuCategory.findUnique({
        where: { slug: nextSlug },
      });

      if (conflict) {
        throw new ConflictException(`Category "${nextSlug}" already exists.`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.menuCategory.update({
        where: { slug },
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
          where: { categorySlug: slug },
          data: { categorySlug: nextSlug },
        });
      }

      return updated;
    });
  }

  async removeCategory(slug: string): Promise<void> {
    const category = await this.prisma.menuCategory.findUnique({
      where: { slug },
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

    await this.prisma.menuCategory.delete({ where: { slug } });
  }

  private buildCreateInput(dto: CreateMenuItemDto): Prisma.MenuItemCreateInput {
    const sizeOptions = this.resolveSizeOptions(dto);
    const price = dto.price ?? (sizeOptions ? deriveBasePrice(sizeOptions) : dto.price);

    return {
      slug: dto.slug,
      number: dto.number,
      name: dto.name,
      description: dto.description,
      price,
      category: { connect: { slug: dto.categorySlug.trim().toLowerCase() } },
      imageUrl: dto.imageUrl,
      imageAlt: dto.imageAlt,
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

  private buildUpdateInput(dto: UpdateMenuItemDto): Prisma.MenuItemUpdateInput {
    const sizeOptions =
      dto.sizeOptions === null
        ? null
        : dto.sizeOptions
          ? (dto.sizeOptions as unknown as SizeOptions)
          : undefined;

    return {
      slug: dto.slug,
      number: dto.number,
      name: dto.name,
      description: dto.description,
      price: dto.price,
      ...(dto.categorySlug
        ? { category: { connect: { slug: dto.categorySlug.trim().toLowerCase() } } }
        : {}),
      imageUrl: dto.imageUrl,
      imageAlt: dto.imageAlt,
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
    };
  }

  private resolveSizeOptions(dto: CreateMenuItemDto): SizeOptions | undefined {
    if (dto.sizeOptions) {
      return dto.sizeOptions as unknown as SizeOptions;
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
    );

    return {
      ...item,
      ingredients,
    };
  }

  private async ensureExists(id: string): Promise<void> {
    const item = await this.prisma.menuItem.findUnique({ where: { id } });

    if (!item) {
      throw new NotFoundException('Menu item not found');
    }
  }
}
