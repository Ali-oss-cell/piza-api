import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCustomerTagDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  color?: string;
}
