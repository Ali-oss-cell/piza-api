import {
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class ComboSelectionDto {
  @IsUUID()
  slotId!: string;

  @IsUUID()
  menuItemId!: string;

  @IsOptional()
  @IsString()
  size?: string;

  @IsOptional()
  @IsString()
  crust?: string;

  @IsOptional()
  @IsString({ each: true })
  toppingIds?: string[];

  @IsOptional()
  @IsString({ each: true })
  removedIngredients?: string[];
}
