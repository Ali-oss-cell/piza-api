import {
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Brand, StoreMembershipRole, UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { DEFAULT_BRAND_SLUG } from '../constants/brands';
import { PrismaService } from '../../prisma/prisma.service';

const MANAGE_ROLES: StoreMembershipRole[] = [
  StoreMembershipRole.PLATFORM_ADMIN,
  StoreMembershipRole.STORE_ADMIN,
];

@Injectable()
export class StoreAccessService {
  constructor(private readonly prisma: PrismaService) {}

  isGlobalPlatformAdmin(user: AuthenticatedUser): boolean {
    return user.role === UserRole.ADMIN;
  }

  async isPlatformAdmin(user: AuthenticatedUser): Promise<boolean> {
    if (this.isGlobalPlatformAdmin(user)) {
      return true;
    }

    const membership = await this.prisma.userStore.findFirst({
      where: {
        userId: user.id,
        isActive: true,
        role: StoreMembershipRole.PLATFORM_ADMIN,
      },
    });

    return Boolean(membership);
  }

  async assertPlatformAdmin(user: AuthenticatedUser): Promise<void> {
    if (!(await this.isPlatformAdmin(user))) {
      throw new ForbiddenException('Platform admin access required.');
    }
  }

  async canAccessAdminApp(user: AuthenticatedUser): Promise<boolean> {
    if (
      user.role === UserRole.ADMIN ||
      user.role === UserRole.MANAGER
    ) {
      return true;
    }

    const membership = await this.prisma.userStore.findFirst({
      where: {
        userId: user.id,
        isActive: true,
        role: { in: MANAGE_ROLES },
      },
    });

    return Boolean(membership);
  }

  async assertCanManageStore(
    user: AuthenticatedUser,
    brandSlug?: string,
  ): Promise<void> {
    if (this.isGlobalPlatformAdmin(user)) {
      return;
    }

    const slug = (brandSlug ?? DEFAULT_BRAND_SLUG).trim().toLowerCase();
    const membership = await this.prisma.userStore.findFirst({
      where: {
        userId: user.id,
        isActive: true,
        role: { in: MANAGE_ROLES },
        store: { slug, isActive: true },
      },
    });

    if (!membership) {
      throw new ForbiddenException(
        `You do not have admin access to store "${slug}".`,
      );
    }
  }

  async listAccessibleBrands(user: AuthenticatedUser): Promise<Brand[]> {
    if (await this.isPlatformAdmin(user)) {
      return this.prisma.brand.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      });
    }

    const memberships = await this.prisma.userStore.findMany({
      where: {
        userId: user.id,
        isActive: true,
        role: { in: MANAGE_ROLES },
        store: { isActive: true },
      },
      include: { store: true },
      orderBy: { createdAt: 'asc' },
    });

    return memberships.map((membership) => membership.store);
  }
}
