import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { StoreAccessService } from '../services/store-access.service';

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly storeAccess: StoreAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      user?: AuthenticatedUser;
    }>();

    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Authentication required.');
    }

    await this.storeAccess.assertPlatformAdmin(user);
    return true;
  }
}
