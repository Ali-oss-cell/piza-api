import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateIngredientCategoryDto {
  @IsString()
  slug!: string;

  @IsString()
  label!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
