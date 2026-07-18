import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { BRAND_SLUG_HEADER } from '../constants/brands';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { StoreAccessService } from '../services/store-access.service';

interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly storeAccess: StoreAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    const expandedRoles = this.expandRoles(requiredRoles);

    if (!expandedRoles.includes(user.role)) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const needsStoreManage =
      requiredRoles.includes(UserRole.ADMIN) ||
      requiredRoles.includes(UserRole.MANAGER);

    if (needsStoreManage && !this.storeAccess.isGlobalPlatformAdmin(user)) {
      const header = request.headers[BRAND_SLUG_HEADER];
      const query = request.query.brand;
      const brandSlug =
        (typeof header === 'string' && header.trim()) ||
        (typeof query === 'string' && query.trim()) ||
        undefined;

      await this.storeAccess.assertCanManageStore(user, brandSlug);
    }

    return true;
  }

  private expandRoles(requiredRoles: UserRole[]): UserRole[] {
    const roles = new Set(requiredRoles);

    if (roles.has(UserRole.STAFF)) {
      roles.add(UserRole.MANAGER);
      roles.add(UserRole.ADMIN);
    }

    if (roles.has(UserRole.MANAGER)) {
      roles.add(UserRole.ADMIN);
    }

    // Store managers can hit admin-scoped store APIs when membership allows.
    if (roles.has(UserRole.ADMIN)) {
      roles.add(UserRole.MANAGER);
    }

    return [...roles];
  }
}
