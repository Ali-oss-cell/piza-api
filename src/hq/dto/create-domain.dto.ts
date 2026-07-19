import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateDomainDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  storeSlug!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  host?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  pathPrefix?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
