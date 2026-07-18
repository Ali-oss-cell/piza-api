import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { BRAND_SLUG_HEADER } from '../constants/brands';
import { StoreAccessService } from '../services/store-access.service';

@Injectable()
export class StoreManagerGuard implements CanActivate {
  constructor(private readonly storeAccess: StoreAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
      headers: Record<string, string | string[] | undefined>;
      query: Record<string, string | string[] | undefined>;
    }>();

    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Authentication required.');
    }

    if (!(await this.storeAccess.canAccessAdminApp(user))) {
      throw new ForbiddenException('Admin access required.');
    }

    const header = request.headers[BRAND_SLUG_HEADER];
    const query = request.query.brand;
    const brandSlug =
      (typeof header === 'string' && header.trim()) ||
      (typeof query === 'string' && query.trim()) ||
      undefined;

    await this.storeAccess.assertCanManageStore(user, brandSlug);
    return true;
  }
}
