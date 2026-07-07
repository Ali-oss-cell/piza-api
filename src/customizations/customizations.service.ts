import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ExtraTopping, CrustOption, Ingredient, IngredientCategory, ToppingCategory } from '@prisma/client';
import { BrandsService } from '../brands/brands.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCrustOptionDto } from './dto/create-crust-option.dto';
import { CreateIngredientCategoryDto } from './dto/create-ingredient-category.dto';
import { CreateIngredientDto } from './dto/create-ingredient.dto';
import { CreateToppingCategoryDto } from './dto/create-topping-category.dto';
import { CreateToppingDto } from './dto/create-topping.dto';
import { UpdateCrustOptionDto } from './dto/update-crust-option.dto';
import { UpdateIngredientCategoryDto } from './dto/update-ingredient-category.dto';
import { UpdateIngredientDto } from './dto/update-ingredient.dto';
import { UpdateToppingCategoryDto } from './dto/update-topping-category.dto';
import { UpdateToppingDto } from './dto/update-topping.dto';

export interface ToppingCategoryGroup {
  id: string;
  label: string;
  toppings: ExtraTopping[];
}

export interface IngredientCategoryGroup {
  id: string;
  label: string;
  ingredients: Ingredient[];
}

@Injectable()
export class CustomizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandsService: BrandsService,
  ) {}

  findActiveToppings(brandSlug?: string): Promise<ExtraTopping[]> {
    return this.brandsService.resolveBrandId(brandSlug).then((brandId) =>
      this.prisma.extraTopping.findMany({
        where: { brandId, isActive: true },
        orderBy: [{ categorySlug: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
      }),
    );
  }

  findAllToppings(brandSlug?: string): Promise<ExtraTopping[]> {
    return this.brandsService.resolveBrandId(brandSlug).then((brandId) =>
      this.prisma.extraTopping.findMany({
        where: { brandId },
        orderBy: [{ categorySlug: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
      }),
    );
  }

  findAllCategories(brandSlug?: string): Promise<ToppingCategory[]> {
    return this.brandsService.resolveBrandId(brandSlug).then((brandId) =>
      this.prisma.toppingCategory.findMany({
        where: { brandId },
        orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      }),
    );
  }

  groupToppings(toppings: ExtraTopping[]): ToppingCategoryGroup[] {
    const groups = new Map<string, ToppingCategoryGroup>();

    for (const topping of toppings) {
      const existing = groups.get(topping.categorySlug);

      if (existing) {
        existing.toppings.push(topping);
        continue;
      }

      groups.set(topping.categorySlug, {
        id: topping.categorySlug,
        label: topping.categoryLabel,
        toppings: [topping],
      });
    }

    return [...groups.values()];
  }

  async createCategory(
    dto: CreateToppingCategoryDto,
    brandSlug?: string,
  ): Promise<ToppingCategory> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const slug = dto.slug.trim().toLowerCase();

    const existing = await this.prisma.toppingCategory.findUnique({
      where: { brandId_slug: { brandId, slug } },
    });

    if (existing) {
      throw new ConflictException(`Category "${slug}" already exists.`);
    }

    return this.prisma.toppingCategory.create({
      data: {
        brandId,
        slug,
        label: dto.label.trim(),
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateCategory(
    slug: string,
    dto: UpdateToppingCategoryDto,
    brandSlug?: string,
  ): Promise<ToppingCategory> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const category = await this.prisma.toppingCategory.findUnique({
      where: { brandId_slug: { brandId, slug } },
    });

    if (!category) {
      throw new NotFoundException(`Category "${slug}" not found.`);
    }

    const nextSlug = dto.slug?.trim().toLowerCase();
    const nextLabel = dto.label?.trim();

    if (nextSlug && nextSlug !== slug) {
      const conflict = await this.prisma.toppingCategory.findUnique({
        where: { brandId_slug: { brandId, slug: nextSlug } },
      });

      if (conflict) {
        throw new ConflictException(`Category "${nextSlug}" already exists.`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.toppingCategory.update({
        where: { brandId_slug: { brandId, slug } },
        data: {
          ...(nextSlug ? { slug: nextSlug } : {}),
          ...(nextLabel ? { label: nextLabel } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        },
      });

      if (nextSlug || nextLabel) {
        await tx.extraTopping.updateMany({
          where: { brandId, categorySlug: slug },
          data: {
            ...(nextSlug ? { categorySlug: nextSlug } : {}),
            ...(nextLabel ? { categoryLabel: nextLabel } : {}),
          },
        });
      }

      return updated;
    });
  }

  async removeCategory(slug: string, brandSlug?: string): Promise<void> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const category = await this.prisma.toppingCategory.findUnique({
      where: { brandId_slug: { brandId, slug } },
      include: { _count: { select: { toppings: true } } },
    });

    if (!category) {
      throw new NotFoundException(`Category "${slug}" not found.`);
    }

    if (category._count.toppings > 0) {
      throw new BadRequestException(
        'Remove or reassign toppings before deleting this category.',
      );
    }

    await this.prisma.toppingCategory.delete({
      where: { brandId_slug: { brandId, slug } },
    });
  }

  async createTopping(dto: CreateToppingDto, brandSlug?: string): Promise<ExtraTopping> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const slug = dto.slug.trim().toLowerCase();
    const categorySlug = dto.categorySlug.trim().toLowerCase();

    const category = await this.prisma.toppingCategory.findUnique({
      where: { brandId_slug: { brandId, slug: categorySlug } },
    });

    if (!category) {
      throw new NotFoundException(`Category "${categorySlug}" not found.`);
    }

    const existing = await this.prisma.extraTopping.findUnique({
      where: { brandId_slug: { brandId, slug } },
    });

    if (existing) {
      throw new ConflictException(`Topping "${slug}" already exists.`);
    }

    return this.prisma.extraTopping.create({
      data: {
        brandId,
        slug,
        label: dto.label.trim(),
        categorySlug: category.slug,
        categoryLabel: category.label,
        priceDelta: dto.priceDelta,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateTopping(
    id: string,
    dto: UpdateToppingDto,
    brandSlug?: string,
  ): Promise<ExtraTopping> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const topping = await this.prisma.extraTopping.findFirst({
      where: { id, brandId },
    });

    if (!topping) {
      throw new NotFoundException(`Topping "${id}" not found.`);
    }

    let categoryLabel = topping.categoryLabel;
    let categorySlug = topping.categorySlug;

    if (dto.categorySlug) {
      const category = await this.prisma.toppingCategory.findUnique({
        where: {
          brandId_slug: {
            brandId,
            slug: dto.categorySlug.trim().toLowerCase(),
          },
        },
      });

      if (!category) {
        throw new NotFoundException(`Category "${dto.categorySlug}" not found.`);
      }

      categorySlug = category.slug;
      categoryLabel = category.label;
    }

    if (dto.slug) {
      const nextSlug = dto.slug.trim().toLowerCase();
      if (nextSlug !== topping.slug) {
        const conflict = await this.prisma.extraTopping.findUnique({
          where: { brandId_slug: { brandId, slug: nextSlug } },
        });

        if (conflict) {
          throw new ConflictException(`Topping "${nextSlug}" already exists.`);
        }
      }
    }

    return this.prisma.extraTopping.update({
      where: { id },
      data: {
        ...(dto.slug ? { slug: dto.slug.trim().toLowerCase() } : {}),
        ...(dto.label ? { label: dto.label.trim() } : {}),
        categorySlug,
        categoryLabel,
        ...(dto.priceDelta !== undefined ? { priceDelta: dto.priceDelta } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async removeTopping(id: string): Promise<void> {
    const topping = await this.prisma.extraTopping.findUnique({ where: { id } });

    if (!topping) {
      throw new NotFoundException(`Topping "${id}" not found.`);
    }

    await this.prisma.extraTopping.delete({ where: { id } });
  }

  findActiveCrusts(brandSlug?: string): Promise<CrustOption[]> {
    return this.brandsService.resolveBrandId(brandSlug).then((brandId) =>
      this.prisma.crustOption.findMany({
        where: { brandId, isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      }),
    );
  }

  findAllCrusts(brandSlug?: string): Promise<CrustOption[]> {
    return this.brandsService.resolveBrandId(brandSlug).then((brandId) =>
      this.prisma.crustOption.findMany({
        where: { brandId },
        orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      }),
    );
  }

  async createCrust(dto: CreateCrustOptionDto, brandSlug?: string): Promise<CrustOption> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const slug = dto.slug.trim().toLowerCase();

    const existing = await this.prisma.crustOption.findUnique({
      where: { brandId_slug: { brandId, slug } },
    });

    if (existing) {
      throw new ConflictException(`Crust "${slug}" already exists.`);
    }

    return this.prisma.crustOption.create({
      data: {
        brandId,
        slug,
        label: dto.label.trim(),
        priceDelta: dto.priceDelta,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateCrust(
    id: string,
    dto: UpdateCrustOptionDto,
    brandSlug?: string,
  ): Promise<CrustOption> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const crust = await this.prisma.crustOption.findFirst({ where: { id, brandId } });

    if (!crust) {
      throw new NotFoundException(`Crust "${id}" not found.`);
    }

    if (dto.slug) {
      const nextSlug = dto.slug.trim().toLowerCase();
      if (nextSlug !== crust.slug) {
        const conflict = await this.prisma.crustOption.findUnique({
          where: { brandId_slug: { brandId, slug: nextSlug } },
        });

        if (conflict) {
          throw new ConflictException(`Crust "${nextSlug}" already exists.`);
        }
      }
    }

    return this.prisma.crustOption.update({
      where: { id },
      data: {
        ...(dto.slug ? { slug: dto.slug.trim().toLowerCase() } : {}),
        ...(dto.label ? { label: dto.label.trim() } : {}),
        ...(dto.priceDelta !== undefined ? { priceDelta: dto.priceDelta } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async removeCrust(id: string): Promise<void> {
    const crust = await this.prisma.crustOption.findUnique({ where: { id } });

    if (!crust) {
      throw new NotFoundException(`Crust "${id}" not found.`);
    }

    await this.prisma.crustOption.delete({ where: { id } });
  }

  findActiveIngredients(brandSlug?: string): Promise<Ingredient[]> {
    return this.brandsService.resolveBrandId(brandSlug).then((brandId) =>
      this.prisma.ingredient.findMany({
        where: { brandId, isActive: true },
        orderBy: [{ categorySlug: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
      }),
    );
  }

  findAllIngredients(brandSlug?: string): Promise<Ingredient[]> {
    return this.brandsService.resolveBrandId(brandSlug).then((brandId) =>
      this.prisma.ingredient.findMany({
        where: { brandId },
        orderBy: [{ categorySlug: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
      }),
    );
  }

  findAllIngredientCategories(brandSlug?: string): Promise<IngredientCategory[]> {
    return this.brandsService.resolveBrandId(brandSlug).then((brandId) =>
      this.prisma.ingredientCategory.findMany({
        where: { brandId },
        orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      }),
    );
  }

  groupIngredients(ingredients: Ingredient[]): IngredientCategoryGroup[] {
    const groups = new Map<string, IngredientCategoryGroup>();

    for (const ingredient of ingredients) {
      const existing = groups.get(ingredient.categorySlug);

      if (existing) {
        existing.ingredients.push(ingredient);
        continue;
      }

      groups.set(ingredient.categorySlug, {
        id: ingredient.categorySlug,
        label: ingredient.categoryLabel,
        ingredients: [ingredient],
      });
    }

    return [...groups.values()];
  }

  async createIngredientCategory(
    dto: CreateIngredientCategoryDto,
    brandSlug?: string,
  ): Promise<IngredientCategory> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const slug = dto.slug.trim().toLowerCase();

    const existing = await this.prisma.ingredientCategory.findUnique({
      where: { brandId_slug: { brandId, slug } },
    });

    if (existing) {
      throw new ConflictException(`Ingredient category "${slug}" already exists.`);
    }

    return this.prisma.ingredientCategory.create({
      data: {
        brandId,
        slug,
        label: dto.label.trim(),
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateIngredientCategory(
    slug: string,
    dto: UpdateIngredientCategoryDto,
    brandSlug?: string,
  ): Promise<IngredientCategory> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const category = await this.prisma.ingredientCategory.findUnique({
      where: { brandId_slug: { brandId, slug } },
    });

    if (!category) {
      throw new NotFoundException(`Ingredient category "${slug}" not found.`);
    }

    const nextSlug = dto.slug?.trim().toLowerCase();
    const nextLabel = dto.label?.trim();

    if (nextSlug && nextSlug !== slug) {
      const conflict = await this.prisma.ingredientCategory.findUnique({
        where: { brandId_slug: { brandId, slug: nextSlug } },
      });

      if (conflict) {
        throw new ConflictException(`Ingredient category "${nextSlug}" already exists.`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.ingredientCategory.update({
        where: { brandId_slug: { brandId, slug } },
        data: {
          ...(nextSlug ? { slug: nextSlug } : {}),
          ...(nextLabel ? { label: nextLabel } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        },
      });

      if (nextSlug || nextLabel) {
        await tx.ingredient.updateMany({
          where: { brandId, categorySlug: slug },
          data: {
            ...(nextSlug ? { categorySlug: nextSlug } : {}),
            ...(nextLabel ? { categoryLabel: nextLabel } : {}),
          },
        });
      }

      return updated;
    });
  }

  async removeIngredientCategory(slug: string, brandSlug?: string): Promise<void> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const category = await this.prisma.ingredientCategory.findUnique({
      where: { brandId_slug: { brandId, slug } },
      include: { _count: { select: { ingredients: true } } },
    });

    if (!category) {
      throw new NotFoundException(`Ingredient category "${slug}" not found.`);
    }

    if (category._count.ingredients > 0) {
      throw new BadRequestException(
        'Remove or reassign ingredients before deleting this category.',
      );
    }

    await this.prisma.ingredientCategory.delete({
      where: { brandId_slug: { brandId, slug } },
    });
  }

  async createIngredient(dto: CreateIngredientDto, brandSlug?: string): Promise<Ingredient> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const slug = dto.slug.trim().toLowerCase();
    const categorySlug = dto.categorySlug.trim().toLowerCase();

    const category = await this.prisma.ingredientCategory.findUnique({
      where: { brandId_slug: { brandId, slug: categorySlug } },
    });

    if (!category) {
      throw new NotFoundException(`Ingredient category "${categorySlug}" not found.`);
    }

    const existing = await this.prisma.ingredient.findUnique({
      where: { brandId_slug: { brandId, slug } },
    });

    if (existing) {
      throw new ConflictException(`Ingredient "${slug}" already exists.`);
    }

    return this.prisma.ingredient.create({
      data: {
        brandId,
        slug,
        label: dto.label.trim(),
        categorySlug: category.slug,
        categoryLabel: category.label,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateIngredient(
    id: string,
    dto: UpdateIngredientDto,
    brandSlug?: string,
  ): Promise<Ingredient> {
    const brandId = await this.brandsService.resolveBrandId(brandSlug);
    const ingredient = await this.prisma.ingredient.findFirst({
      where: { id, brandId },
    });

    if (!ingredient) {
      throw new NotFoundException(`Ingredient "${id}" not found.`);
    }

    let categoryLabel = ingredient.categoryLabel;
    let categorySlug = ingredient.categorySlug;

    if (dto.categorySlug) {
      const category = await this.prisma.ingredientCategory.findUnique({
        where: {
          brandId_slug: {
            brandId,
            slug: dto.categorySlug.trim().toLowerCase(),
          },
        },
      });

      if (!category) {
        throw new NotFoundException(`Ingredient category "${dto.categorySlug}" not found.`);
      }

      categorySlug = category.slug;
      categoryLabel = category.label;
    }

    if (dto.slug) {
      const nextSlug = dto.slug.trim().toLowerCase();
      if (nextSlug !== ingredient.slug) {
        const conflict = await this.prisma.ingredient.findUnique({
          where: { brandId_slug: { brandId, slug: nextSlug } },
        });

        if (conflict) {
          throw new ConflictException(`Ingredient "${nextSlug}" already exists.`);
        }
      }
    }

    return this.prisma.ingredient.update({
      where: { id },
      data: {
        ...(dto.slug ? { slug: dto.slug.trim().toLowerCase() } : {}),
        ...(dto.label ? { label: dto.label.trim() } : {}),
        categorySlug,
        categoryLabel,
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async removeIngredient(id: string): Promise<void> {
    const ingredient = await this.prisma.ingredient.findUnique({ where: { id } });

    if (!ingredient) {
      throw new NotFoundException(`Ingredient "${id}" not found.`);
    }

    await this.prisma.ingredient.delete({ where: { id } });
  }

  async resolveIngredientLabels(slugs: string[], brandId: string): Promise<string[]> {
    if (slugs.length === 0) {
      return [];
    }

    const records = await this.prisma.ingredient.findMany({
      where: { brandId, slug: { in: slugs } },
    });
    const bySlug = new Map(records.map((entry) => [entry.slug, entry.label]));

    return slugs.map((slug) => bySlug.get(slug) ?? slug);
  }
}
