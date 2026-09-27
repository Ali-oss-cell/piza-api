import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PosDiscountType } from '@prisma/client';

export class PosDiscountDto {
  @IsEnum(PosDiscountType)
  type!: PosDiscountType;

  /** Percent 0-100, or dollar amount; ignored for COMP. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  value?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
