import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateMenuCategoryDto {
  @IsOptional()
  @IsString()
  slug?: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  supportsSizeOptions?: boolean;

  @IsOptional()
  @IsBoolean()
  supportsExtras?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
