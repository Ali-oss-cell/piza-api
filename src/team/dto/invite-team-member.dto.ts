import { StoreMembershipRole } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

const INVITABLE_ROLES = [
  StoreMembershipRole.STORE_ADMIN,
  StoreMembershipRole.STAFF,
];

export class InviteTeamMemberDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  lastName!: string;

  @IsEnum(StoreMembershipRole)
  @IsIn(INVITABLE_ROLES)
  role!: (typeof INVITABLE_ROLES)[number];

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  brandSlug!: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(120)
  temporaryPassword?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;
}
