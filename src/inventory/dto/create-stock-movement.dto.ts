import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { StockMovementType } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateStockMovementDto {
  @IsEnum(StockMovementType)
  type!: StockMovementType;

  /**
   * RECEIVE / WASTE: positive amount to add or remove.
   * ADJUST: signed delta (+/−).
   * COUNT: ignored; use `qty` for absolute on-hand after count.
   */
  @ValidateIf((dto: CreateStockMovementDto) => dto.type !== StockMovementType.COUNT)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  qty?: number;

  /** Absolute on-hand after physical count (COUNT only). */
  @ValidateIf((dto: CreateStockMovementDto) => dto.type === StockMovementType.COUNT)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  countedQty?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string | null;
}
