import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateToppingDto {
  @IsString()
  slug!: string;

  @IsString()
  label!: string;

  @IsString()
  categorySlug!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  priceDelta!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
