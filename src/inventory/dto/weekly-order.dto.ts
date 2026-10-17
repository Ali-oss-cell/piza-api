import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateWeeklyOrderDto {
  @IsDateString()
  weekCommencing!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  orderedBy?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  pizzasExpected?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  supplierDay?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  /** Start from a previous week: copies header values and order quantities. */
  @IsOptional()
  @IsUUID()
  copyFromOrderId?: string;
}

export class WeeklyOrderLineUpdateDto {
  @IsUUID()
  id!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  stockOnHand?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0)
  orderQty?: number | null;

  @IsOptional()
  @IsBoolean()
  received?: boolean;

  /** Assigns the vendor on this line and as the item's default vendor. */
  @IsOptional()
  @IsUUID()
  supplierId?: string | null;
}

export class UpdateWeeklyOrderDto {
  @IsOptional()
  @IsDateString()
  weekCommencing?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  orderedBy?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  pizzasExpected?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  supplierDay?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => WeeklyOrderLineUpdateDto)
  lines?: WeeklyOrderLineUpdateDto[];
}

export class SendWeeklyOrderDto {
  /** Limit the send to these vendors (resend). Omit to send to all vendors with items. */
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  supplierIds?: string[];
}
