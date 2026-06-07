import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateToppingCategoryDto {
  @IsString()
  slug!: string;

  @IsString()
  label!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
