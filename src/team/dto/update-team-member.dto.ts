import { StoreMembershipRole } from '@prisma/client';
import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';

const UPDATABLE_ROLES = [
  StoreMembershipRole.STORE_ADMIN,
  StoreMembershipRole.STAFF,
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
}
