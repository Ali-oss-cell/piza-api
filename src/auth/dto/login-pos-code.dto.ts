import { Matches } from 'class-validator';

export class LoginPosCodeDto {
  @Matches(/^\d{4,6}$/, { message: 'POS code must be 4–6 digits.' })
  code!: string;
}
