import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ExtraTopping, CrustOption, Ingredient, IngredientCategory, ToppingCategory } from '@prisma/client';
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
  constructor(private readonly prisma: PrismaService) {}

  findActiveToppings(): Promise<ExtraTopping[]> {
    return this.prisma.extraTopping.findMany({
      where: { isActive: true },
      orderBy: [{ categorySlug: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  findAllToppings(): Promise<ExtraTopping[]> {
    return this.prisma.extraTopping.findMany({
      orderBy: [{ categorySlug: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  findAllCategories(): Promise<ToppingCategory[]> {
    return this.prisma.toppingCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
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

  async createCategory(dto: CreateToppingCategoryDto): Promise<ToppingCategory> {
    const slug = dto.slug.trim().toLowerCase();

    const existing = await this.prisma.toppingCategory.findUnique({
      where: { slug },
    });

    if (existing) {
      throw new ConflictException(`Category "${slug}" already exists.`);
    }

    return this.prisma.toppingCategory.create({
      data: {
        slug,
        label: dto.label.trim(),
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateCategory(
    slug: string,
    dto: UpdateToppingCategoryDto,
  ): Promise<ToppingCategory> {
    const category = await this.prisma.toppingCategory.findUnique({
      where: { slug },
    });

    if (!category) {
      throw new NotFoundException(`Category "${slug}" not found.`);
    }

    const nextSlug = dto.slug?.trim().toLowerCase();
    const nextLabel = dto.label?.trim();

    if (nextSlug && nextSlug !== slug) {
      const conflict = await this.prisma.toppingCategory.findUnique({
        where: { slug: nextSlug },
      });

      if (conflict) {
        throw new ConflictException(`Category "${nextSlug}" already exists.`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.toppingCategory.update({
        where: { slug },
        data: {
          ...(nextSlug ? { slug: nextSlug } : {}),
          ...(nextLabel ? { label: nextLabel } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        },
      });

      if (nextSlug || nextLabel) {
        await tx.extraTopping.updateMany({
          where: { categorySlug: slug },
          data: {
            ...(nextSlug ? { categorySlug: nextSlug } : {}),
            ...(nextLabel ? { categoryLabel: nextLabel } : {}),
          },
        });
      }

      return updated;
    });
  }

  async removeCategory(slug: string): Promise<void> {
    const category = await this.prisma.toppingCategory.findUnique({
      where: { slug },
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

    await this.prisma.toppingCategory.delete({ where: { slug } });
  }

  async createTopping(dto: CreateToppingDto): Promise<ExtraTopping> {
    const slug = dto.slug.trim().toLowerCase();
    const categorySlug = dto.categorySlug.trim().toLowerCase();

    const category = await this.prisma.toppingCategory.findUnique({
      where: { slug: categorySlug },
    });

    if (!category) {
      throw new NotFoundException(`Category "${categorySlug}" not found.`);
    }

    const existing = await this.prisma.extraTopping.findUnique({
      where: { slug },
    });

    if (existing) {
      throw new ConflictException(`Topping "${slug}" already exists.`);
    }

    return this.prisma.extraTopping.create({
      data: {
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

  async updateTopping(id: string, dto: UpdateToppingDto): Promise<ExtraTopping> {
    const topping = await this.prisma.extraTopping.findUnique({ where: { id } });

    if (!topping) {
      throw new NotFoundException(`Topping "${id}" not found.`);
    }

    let categoryLabel = topping.categoryLabel;
    let categorySlug = topping.categorySlug;

    if (dto.categorySlug) {
      const category = await this.prisma.toppingCategory.findUnique({
        where: { slug: dto.categorySlug.trim().toLowerCase() },
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
          where: { slug: nextSlug },
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

  findActiveCrusts(): Promise<CrustOption[]> {
    return this.prisma.crustOption.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  findAllCrusts(): Promise<CrustOption[]> {
    return this.prisma.crustOption.findMany({
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  async createCrust(dto: CreateCrustOptionDto): Promise<CrustOption> {
    const slug = dto.slug.trim().toLowerCase();

    const existing = await this.prisma.crustOption.findUnique({
      where: { slug },
    });

    if (existing) {
      throw new ConflictException(`Crust "${slug}" already exists.`);
    }

    return this.prisma.crustOption.create({
      data: {
        slug,
        label: dto.label.trim(),
        priceDelta: dto.priceDelta,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateCrust(id: string, dto: UpdateCrustOptionDto): Promise<CrustOption> {
    const crust = await this.prisma.crustOption.findUnique({ where: { id } });

    if (!crust) {
      throw new NotFoundException(`Crust "${id}" not found.`);
    }

    if (dto.slug) {
      const nextSlug = dto.slug.trim().toLowerCase();
      if (nextSlug !== crust.slug) {
        const conflict = await this.prisma.crustOption.findUnique({
          where: { slug: nextSlug },
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

  findActiveIngredients(): Promise<Ingredient[]> {
    return this.prisma.ingredient.findMany({
      where: { isActive: true },
      orderBy: [{ categorySlug: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  findAllIngredients(): Promise<Ingredient[]> {
    return this.prisma.ingredient.findMany({
      orderBy: [{ categorySlug: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  findAllIngredientCategories(): Promise<IngredientCategory[]> {
    return this.prisma.ingredientCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
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
  ): Promise<IngredientCategory> {
    const slug = dto.slug.trim().toLowerCase();

    const existing = await this.prisma.ingredientCategory.findUnique({
      where: { slug },
    });

    if (existing) {
      throw new ConflictException(`Ingredient category "${slug}" already exists.`);
    }

    return this.prisma.ingredientCategory.create({
      data: {
        slug,
        label: dto.label.trim(),
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateIngredientCategory(
    slug: string,
    dto: UpdateIngredientCategoryDto,
  ): Promise<IngredientCategory> {
    const category = await this.prisma.ingredientCategory.findUnique({
      where: { slug },
    });

    if (!category) {
      throw new NotFoundException(`Ingredient category "${slug}" not found.`);
    }

    const nextSlug = dto.slug?.trim().toLowerCase();
    const nextLabel = dto.label?.trim();

    if (nextSlug && nextSlug !== slug) {
      const conflict = await this.prisma.ingredientCategory.findUnique({
        where: { slug: nextSlug },
      });

      if (conflict) {
        throw new ConflictException(`Ingredient category "${nextSlug}" already exists.`);
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.ingredientCategory.update({
        where: { slug },
        data: {
          ...(nextSlug ? { slug: nextSlug } : {}),
          ...(nextLabel ? { label: nextLabel } : {}),
          ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        },
      });

      if (nextSlug || nextLabel) {
        await tx.ingredient.updateMany({
          where: { categorySlug: slug },
          data: {
            ...(nextSlug ? { categorySlug: nextSlug } : {}),
            ...(nextLabel ? { categoryLabel: nextLabel } : {}),
          },
        });
      }

      return updated;
    });
  }

  async removeIngredientCategory(slug: string): Promise<void> {
    const category = await this.prisma.ingredientCategory.findUnique({
      where: { slug },
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

    await this.prisma.ingredientCategory.delete({ where: { slug } });
  }

  async createIngredient(dto: CreateIngredientDto): Promise<Ingredient> {
    const slug = dto.slug.trim().toLowerCase();
    const categorySlug = dto.categorySlug.trim().toLowerCase();

    const category = await this.prisma.ingredientCategory.findUnique({
      where: { slug: categorySlug },
    });

    if (!category) {
      throw new NotFoundException(`Ingredient category "${categorySlug}" not found.`);
    }

    const existing = await this.prisma.ingredient.findUnique({
      where: { slug },
    });

    if (existing) {
      throw new ConflictException(`Ingredient "${slug}" already exists.`);
    }

    return this.prisma.ingredient.create({
      data: {
        slug,
        label: dto.label.trim(),
        categorySlug: category.slug,
        categoryLabel: category.label,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async updateIngredient(id: string, dto: UpdateIngredientDto): Promise<Ingredient> {
    const ingredient = await this.prisma.ingredient.findUnique({ where: { id } });

    if (!ingredient) {
      throw new NotFoundException(`Ingredient "${id}" not found.`);
    }

    let categoryLabel = ingredient.categoryLabel;
    let categorySlug = ingredient.categorySlug;

    if (dto.categorySlug) {
      const category = await this.prisma.ingredientCategory.findUnique({
        where: { slug: dto.categorySlug.trim().toLowerCase() },
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
          where: { slug: nextSlug },
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

  async resolveIngredientLabels(slugs: string[]): Promise<string[]> {
    if (slugs.length === 0) {
      return [];
    }

    const records = await this.prisma.ingredient.findMany({
      where: { slug: { in: slugs } },
    });
    const bySlug = new Map(records.map((entry) => [entry.slug, entry.label]));

    return slugs.map((slug) => bySlug.get(slug) ?? slug);
  }
}
