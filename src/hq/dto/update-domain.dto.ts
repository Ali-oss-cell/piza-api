import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateDomainDto {
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
