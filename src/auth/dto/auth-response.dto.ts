import { UserRole } from '@prisma/client';

export class AuthStoreLocationDto {
  id!: string;
  slug!: string;
  name!: string;
  isDefault!: boolean;
}

export class AuthStoreDto {
  id!: string;
  slug!: string;
  name!: string;
  tagline?: string | null;
  primaryColor?: string | null;
  membershipRole!: string;
  locations!: AuthStoreLocationDto[];
}

export class AuthUserDto {
  id!: string;
  email!: string;
  firstName!: string;
  lastName!: string;
  role!: UserRole;
  stores!: AuthStoreDto[];
}

export class AuthResponseDto {
  accessToken!: string;
  user!: AuthUserDto;
}
