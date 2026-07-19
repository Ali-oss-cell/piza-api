import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { SegmentRulesDto } from './create-customer-segment.dto';

export class UpdateCustomerSegmentDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => SegmentRulesDto)
  rules?: SegmentRulesDto;
}
