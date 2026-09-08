import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

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

export class RefundCardPaymentDto {
  @IsUUID()
  orderId!: string;

  /** Optional partial refund in cents; defaults to full order total. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000_000)
  amountCents?: number;
}

export class LinklySettlementDto {
  /** S = settlement, P = pre-settlement, L = last settlement (per Linkly docs). */
  @IsOptional()
  @IsIn(['S', 'P', 'L'])
  settlementType?: 'S' | 'P' | 'L';
}
