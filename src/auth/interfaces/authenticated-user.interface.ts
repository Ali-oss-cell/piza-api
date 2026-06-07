import { UserRole } from '@prisma/client';

export class AuthenticatedUser {
  id!: string;
  email!: string;
  role!: UserRole;
  firstName!: string;
  lastName!: string;
}
