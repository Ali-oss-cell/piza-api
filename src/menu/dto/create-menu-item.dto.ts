import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Min,
} from 'class-validator';
import { MenuItemBadge } from '@prisma/client';

export class CreateMenuItemDto {
  @IsString()
  slug!: string;

  @IsInt()
  @Min(1)
  number!: number;

  @IsString()
  name!: string;

  @IsString()
  description!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @IsString()
  categorySlug!: string;

  @IsUrl()
  imageUrl!: string;

  @IsString()
  imageAlt!: string;

  @IsOptional()
  @IsArray()
  @IsEnum(MenuItemBadge, { each: true })
  badges?: MenuItemBadge[];

  @IsOptional()
  @IsString()
  priceNote?: string;

  @IsOptional()
  @IsObject()
  sizePricing?: Record<string, number>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ingredients?: string[];

  @IsOptional()
  @IsObject()
  sizeOptions?: Record<string, { enabled: boolean; price: number }>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedToppingIds?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  isFranchiseLocked?: boolean;
}
