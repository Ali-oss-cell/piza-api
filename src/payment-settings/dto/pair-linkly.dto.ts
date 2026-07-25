import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class PairLinklyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  password!: string;

  @IsString()
  @MinLength(4)
  @MaxLength(12)
  pairCode!: string;

  @IsOptional()
  @IsString()
  brandSlug?: string;
}
