import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class VerifyPosPinDto {
  @IsString()
  @Length(4, 6)
  pin!: string;
}

export class ChangePosPinDto {
  @IsString()
  @Length(4, 6)
  currentPin!: string;

  @IsString()
  @Length(4, 6)
  newPin!: string;
}

export class SetPosPinDto {
  @IsUUID()
  userId!: string;

  @IsString()
  @Length(4, 6)
  pin!: string;
}

export class OpenShiftDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  openingFloat?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  registerId?: string;
}

export class CloseShiftDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  closingCountedCash!: number;

  @IsOptional()
  @IsString()
  managerActionToken?: string;
}

export class VoidOrderDto {
  @IsString()
  @MaxLength(300)
  reason!: string;

  @IsString()
  managerActionToken!: string;
}

export class CashRefundDto {
  @IsUUID()
  orderId!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount?: number;

  @IsString()
  @MaxLength(300)
  reason!: string;

  @IsString()
  managerActionToken!: string;
}

export class ToggleTrainingDto {
  @IsString()
  managerActionToken!: string;

  @IsBoolean()
  enabled!: boolean;
}

export class UpdatePrinterSettingsDto {
  @IsOptional()
  @IsString()
  receiptPrinterHost?: string | null;

  @IsOptional()
  receiptPrinterPort?: number | null;

  @IsOptional()
  @IsString()
  kitchenPrinterHost?: string | null;

  @IsOptional()
  kitchenPrinterPort?: number | null;

  @IsOptional()
  @IsBoolean()
  requireOpenShift?: boolean;
}

export class AddFavouriteDto {
  @IsUUID()
  menuItemId!: string;
}

export class EscPosPrintDto {
  @IsString()
  target!: 'receipt' | 'kitchen';

  @IsString()
  @MaxLength(8000)
  text!: string;
}
