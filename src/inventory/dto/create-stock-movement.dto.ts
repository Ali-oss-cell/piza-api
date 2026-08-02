import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { StockMovementType } from '@prisma/client';
import { Type } from 'class-transformer';

export class CreateStockMovementDto {
  @IsEnum(StockMovementType)
  type!: StockMovementType;

  /**
   * RECEIVE / WASTE: positive amount to add or remove.
   * ADJUST: signed delta (+/−).
   * COUNT: ignored; use countedQty.
   * SALE: not allowed via this endpoint.
   */
  @ValidateIf((dto: CreateStockMovementDto) => dto.type !== StockMovementType.COUNT)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  qty?: number;

  @ValidateIf((dto: CreateStockMovementDto) => dto.type === StockMovementType.COUNT)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  countedQty?: number;

  /** Required for RECEIVE — AUD paid per unit this delivery. */
  @ValidateIf((dto: CreateStockMovementDto) => dto.type === StockMovementType.RECEIVE)
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost?: number;

  /** Business date of the delivery (RECEIVE). Defaults to now. */
  @IsOptional()
  @IsDateString()
  receivedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string | null;
}

export class RecipeLineDto {
  @IsUUID()
  stockItemId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  qtyPerUnit!: number;
}

export class ReplaceRecipeDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipeLineDto)
  lines!: RecipeLineDto[];
}
