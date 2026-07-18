import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { StorePaymentProvider } from '@prisma/client';

export class UpdatePaymentSettingsDto {
  @IsOptional()
  @IsEnum(StorePaymentProvider)
  provider?: StorePaymentProvider;

  @IsOptional()
  @IsBoolean()
  cashEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  cardTerminalEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  cardOnlineEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  stripePublishableKey?: string | null;

  /** Opaque ref / vault key name — never return the raw secret. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  stripeSecretKeyRef?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  stripeWebhookSecretRef?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  stripeTerminalLocationId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  stripeTerminalReaderId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  locationId?: string;
}
