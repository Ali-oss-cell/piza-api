import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateEmailSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  host?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @IsOptional()
  @IsBoolean()
  secure?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  username?: string | null;

  /** Write-only. Blank / omitted keeps the saved password. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  password?: string;

  /** Set true to delete the saved password. */
  @IsOptional()
  @IsBoolean()
  clearPassword?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  fromName?: string | null;

  @IsOptional()
  @IsEmail()
  fromEmail?: string | null;

  @IsOptional()
  @IsEmail()
  replyTo?: string | null;
}

export class SendTestEmailDto {
  @IsEmail()
  to!: string;
}
