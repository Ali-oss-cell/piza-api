import { UserRole } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  /** 'pos' = issued by PIN login; only valid on POS routes for one store. */
  scope?: 'pos';
  storeId?: string;
  /** Set on special-purpose tokens (manager approval); never a login. */
  type?: string;
  aud?: string | string[];
}
