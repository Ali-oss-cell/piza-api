import { PartialType, OmitType } from '@nestjs/mapped-types';
import { CreateStockItemDto } from './create-stock-item.dto';

/** Metadata updates only — quantity changes go through movements. */
export class UpdateStockItemDto extends PartialType(
  OmitType(CreateStockItemDto, ['qtyOnHand'] as const),
) {}
