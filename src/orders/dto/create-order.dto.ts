import { DeliveryMode } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CreateOrderItemDto } from './create-order-item.dto';

function toMoney(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : Number(value);
  if (!Number.isFinite(n)) {
    return n;
  }
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export class CreateOrderDto {
  @IsEnum(DeliveryMode)
  deliveryMode!: DeliveryMode;

  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  @IsOptional()
  @IsEmail()
  guestEmail?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  guestName?: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  guestPhone?: string;

  @IsOptional()
  @IsString()
  deliveryAddressLine1?: string;

  @IsOptional()
  @IsString()
  deliveryAddressLine2?: string;

  @IsOptional()
  @IsString()
  deliverySuburb?: string;

  @IsOptional()
  @IsString()
  deliveryState?: string;

  @IsOptional()
  @IsString()
  deliveryPostcode?: string;

  @IsDateString()
  scheduledAt!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @Transform(({ value }) => toMoney(value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  subtotal!: number;

  @Transform(({ value }) => toMoney(value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  deliveryFee!: number;

  @Transform(({ value }) => toMoney(value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  total!: number;

  @IsOptional()
  @IsString()
  locationId?: string;
}
