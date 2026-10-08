import { IsString, Matches, MaxLength } from 'class-validator';

export class LoginPosCodeDto {
  @Matches(/^\d{4,6}$/, { message: 'POS code must be 4–6 digits.' })
  code!: string;

  /** Store this register belongs to (saved on the device at first email sign-in). */
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-z0-9-]+$/, { message: 'Invalid store.' })
  storeSlug!: string;
}
