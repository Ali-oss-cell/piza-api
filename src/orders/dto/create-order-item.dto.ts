import { Type, Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ComboSelectionDto } from '../../pricing/dto/combo-selection.dto';

function toMoney(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : Number(value);
  if (!Number.isFinite(n)) {
    return n;
  }
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export class CreateOrderItemDto {
  @IsOptional()
  @IsIn(['ITEM', 'COMBO'])
  type?: 'ITEM' | 'COMBO';

  @IsOptional()
  @IsUUID()
  menuItemId?: string;

  @ValidateIf(
    (o: CreateOrderItemDto) =>
      (o.type ?? (o.comboDealId ? 'COMBO' : 'ITEM')) === 'ITEM',
  )
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @ValidateIf(
    (o: CreateOrderItemDto) =>
      (o.type ?? (o.comboDealId ? 'COMBO' : 'ITEM')) === 'ITEM',
  )
  @Transform(({ value }) => toMoney(value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;

  @ValidateIf(
    (o: CreateOrderItemDto) =>
      (o.type ?? (o.comboDealId ? 'COMBO' : 'ITEM')) === 'ITEM',
  )
  @IsInt()
  @Min(1)
  quantity?: number;

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

  @ValidateIf(
    (o: CreateOrderItemDto) =>
      (o.type ?? (o.comboDealId ? 'COMBO' : 'ITEM')) === 'COMBO',
  )
  @IsUUID()
  comboDealId?: string;

  @ValidateIf(
    (o: CreateOrderItemDto) =>
      (o.type ?? (o.comboDealId ? 'COMBO' : 'ITEM')) === 'COMBO',
  )
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ComboSelectionDto)
  selections?: ComboSelectionDto[];
}
