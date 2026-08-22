import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class PlatformSecretUpdateItemDto {
  @IsString()
  key!: string;

  /** Null or empty clears the DB override (falls back to env). */
  @IsOptional()
  @IsString()
  value?: string | null;
}

export class UpdatePlatformSecretsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PlatformSecretUpdateItemDto)
  secrets!: PlatformSecretUpdateItemDto[];
}
