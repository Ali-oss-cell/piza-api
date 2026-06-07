import { PartialType } from '@nestjs/mapped-types';
import { CreateIngredientCategoryDto } from './create-ingredient-category.dto';

export class UpdateIngredientCategoryDto extends PartialType(
  CreateIngredientCategoryDto,
) {}
