import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateIngredientDto {
  @IsString()
  slug!: string;

  @IsString()
  label!: string;

  @IsString()
  categorySlug!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
