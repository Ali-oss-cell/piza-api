import { UserRole } from '@prisma/client';

export class AuthenticatedUser {
  id!: string;
  email!: string;
  role!: UserRole;
  firstName!: string;
  lastName!: string;
  /** Present when the session came from a POS PIN login. */
  scope?: 'pos';
  storeId?: string;
}
