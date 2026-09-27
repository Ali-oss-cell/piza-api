import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';
import { PosDiscountDto } from './pos-discount.dto';

export class QuoteLineDto {
  @IsUUID()
  menuItemId!: string;

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
  @IsString({ each: true })
  toppingIds?: string[];

  @IsOptional()
  @IsString({ each: true })
  removedIngredients?: string[];
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
