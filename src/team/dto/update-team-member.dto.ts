import { StoreMembershipRole } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const UPDATABLE_ROLES = [
  StoreMembershipRole.STORE_ADMIN,
  StoreMembershipRole.STAFF,
  StoreMembershipRole.SEO,
] as const;

export class UpdateTeamMemberDto {
  @IsOptional()
  @IsIn(UPDATABLE_ROLES)
  role?: (typeof UPDATABLE_ROLES)[number];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsUUID()
  locationId?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  /** Replaces the register sign-in code. The employee must change it on next sign-in. */
  @IsOptional()
  @Matches(/^\d{4,6}$/, { message: 'POS code must be 4–6 digits.' })
  posPin?: string;
}
