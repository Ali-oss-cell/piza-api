import { FulfillmentType, PosDiscountType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { QuoteLineDto } from '../../pricing/dto/quote-request.dto';

export class CreatePosOrderDto {
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuoteLineDto)
  items!: QuoteLineDto[];

  @IsEnum(FulfillmentType)
  fulfillmentType!: FulfillmentType;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  customerPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  tableNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  pagerNumber?: string;

  @IsOptional()
  @IsString()
  clientRequestId?: string;

  @IsOptional()
  @IsString()
  registerId?: string;

  @IsOptional()
  @IsEnum(PosDiscountType)
  discountType?: PosDiscountType;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  discountValue?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  discountReason?: string;

  @IsOptional()
  @IsString()
  managerActionToken?: string;
}
