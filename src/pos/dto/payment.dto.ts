import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CardPaymentDto {
  @IsUUID()
  orderId!: string;

  @IsOptional()
  @IsString()
  readerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  inventoryOverrideReason?: string;
}

export class CashPaymentDto {
  @IsUUID()
  orderId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  inventoryOverrideReason?: string;
}
