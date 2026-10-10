import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ComboSelectionDto } from './combo-selection.dto';
import { PosDiscountDto } from './pos-discount.dto';

export class QuoteLineDto {
  /** Defaults to ITEM when menuItemId is set; COMBO when comboDealId is set. */
  @IsOptional()
  @IsIn(['ITEM', 'COMBO'])
  type?: 'ITEM' | 'COMBO';

  @ValidateIf(
    (o: QuoteLineDto) =>
      (o.type ?? (o.comboDealId ? 'COMBO' : 'ITEM')) === 'ITEM',
  )
  @IsUUID()
  menuItemId?: string;

  @ValidateIf(
    (o: QuoteLineDto) =>
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
  @IsString({ each: true })
  toppingIds?: string[];

  @IsOptional()
  @IsString({ each: true })
  removedIngredients?: string[];

  @ValidateIf(
    (o: QuoteLineDto) =>
      (o.type ?? (o.comboDealId ? 'COMBO' : 'ITEM')) === 'COMBO',
  )
  @IsUUID()
  comboDealId?: string;

  @ValidateIf(
    (o: QuoteLineDto) =>
      (o.type ?? (o.comboDealId ? 'COMBO' : 'ITEM')) === 'COMBO',
  )
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ComboSelectionDto)
  selections?: ComboSelectionDto[];
}

export class QuoteRequestDto {
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuoteLineDto)
  items!: QuoteLineDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => PosDiscountDto)
  discount?: PosDiscountDto;
}
