import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CardPaymentDto {
  @IsUUID()
  orderId!: string;

  @IsOptional()
  @IsString()
  readerId?: string;
}

export class CashPaymentDto {
  @IsUUID()
  orderId!: string;
}
