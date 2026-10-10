import { ComboSlotSourceType } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';

export class ComboDealSlotDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsString()
  label!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsEnum(ComboSlotSourceType)
  sourceType!: ComboSlotSourceType;

  @ValidateIf((o: ComboDealSlotDto) => o.sourceType === ComboSlotSourceType.CATEGORY)
  @IsString()
  categorySlug?: string;

  @ValidateIf((o: ComboDealSlotDto) => o.sourceType === ComboSlotSourceType.ITEM)
  @IsUUID()
  menuItemId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedSizes?: string[];

  @IsOptional()
  @IsBoolean()
  allowModifiers?: boolean;
}
