import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class TransferMenuDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  sourceBrandSlug!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  targetBrandSlugs!: string[];

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  itemSlugs!: string[];

  @IsOptional()
  @IsBoolean()
  lockItems?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  saveAsName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  saveAsDescription?: string;
}
