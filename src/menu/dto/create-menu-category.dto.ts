import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateMenuCategoryDto {
  @IsString()
  slug!: string;

  @IsString()
  label!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  supportsSizeOptions?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
