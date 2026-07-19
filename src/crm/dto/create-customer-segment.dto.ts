import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class SegmentRulesDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  minOrders?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minSpend?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  lastOrderWithinDays?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  lastOrderBeforeDays?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  hasTags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  missingTags?: string[];

  @IsOptional()
  @IsBoolean()
  marketingEmailOptIn?: boolean;

  @IsOptional()
  @IsBoolean()
  marketingSmsOptIn?: boolean;
}

export class CreateCustomerSegmentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ValidateNested()
  @Type(() => SegmentRulesDto)
  rules!: SegmentRulesDto;
}
