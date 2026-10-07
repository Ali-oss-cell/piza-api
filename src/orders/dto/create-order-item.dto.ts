import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

function toMoney(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : Number(value);
  if (!Number.isFinite(n)) {
    return n;
  }
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export class CreateOrderItemDto {
  @IsOptional()
  @IsUUID()
  menuItemId?: string;

  @IsString()
  name!: string;

  @IsString()
  description!: string;

  @Transform(({ value }) => toMoney(value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  size?: string;

  @IsOptional()
  @IsString()
  crust?: string;

  @IsOptional()
  toppings?: string[];

  @IsOptional()
  @IsString({ each: true })
  removedIngredients?: string[];
}
