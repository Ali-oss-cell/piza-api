import { IsBoolean } from 'class-validator';

export class UpdateStoreStatusDto {
  @IsBoolean()
  isActive!: boolean;
}
