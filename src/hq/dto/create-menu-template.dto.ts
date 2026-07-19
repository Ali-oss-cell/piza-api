import {
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateMenuTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  sourceBrandSlug!: string;

  /** When set, only these menu item slugs are copied into the template. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  itemSlugs?: string[];

  @IsOptional()
  @IsBoolean()
  lockItems?: boolean;
}
