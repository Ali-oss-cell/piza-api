import { StoreMembershipRole } from '@prisma/client';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const INVITABLE_ROLES = [
  StoreMembershipRole.STORE_ADMIN,
  StoreMembershipRole.STAFF,
];

export class InviteHqMemberDto {
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

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  brandSlugs!: string[];

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(120)
  temporaryPassword?: string;
}
