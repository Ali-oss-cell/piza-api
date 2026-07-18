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

export type BrandListItem = Brand & {
  pathPrefix: string | null;
  host: string | null;
};

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

  async listAccessibleBrands(user: AuthenticatedUser): Promise<BrandListItem[]> {
    if (await this.isPlatformAdmin(user)) {
      const brands = await this.prisma.brand.findMany({
        where: { isActive: true },
        include: {
          domains: {
            where: { isActive: true },
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
            take: 1,
          },
        },
        orderBy: { name: 'asc' },
      });

      return brands.map((brand) => this.toListItem(brand));
    }

    const memberships = await this.prisma.userStore.findMany({
      where: {
        userId: user.id,
        isActive: true,
        role: { in: MANAGE_ROLES },
        store: { isActive: true },
      },
      include: {
        store: {
          include: {
            domains: {
              where: { isActive: true },
              orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
              take: 1,
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return memberships.map((membership) => this.toListItem(membership.store));
  }

  private toListItem(
    brand: Brand & {
      domains: Array<{ pathPrefix: string | null; host: string | null }>;
    },
  ): BrandListItem {
    const primary = brand.domains[0];
    const { domains: _domains, ...rest } = brand;
    return {
      ...rest,
      pathPrefix: primary?.pathPrefix ?? null,
      host: primary?.host ?? null,
    };
  }
}
