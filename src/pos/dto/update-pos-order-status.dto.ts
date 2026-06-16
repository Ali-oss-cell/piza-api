import { OrderStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdatePosOrderStatusDto {
  @IsEnum(OrderStatus)
  status!: OrderStatus;
}
