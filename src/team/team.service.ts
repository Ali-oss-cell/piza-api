import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, StoreMembershipRole, UserRole } from '@prisma/client';
import { randomBytes } from 'crypto';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { InviteTeamMemberDto } from './dto/invite-team-member.dto';
import { UpdateTeamMemberDto } from './dto/update-team-member.dto';

@Injectable()
export class TeamService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly auditService: AuditService,
  ) {}

  async listForStore(brandSlug: string): Promise<unknown[]> {
    const brand = await this.resolveBrand(brandSlug);
    return this.prisma.userStore.findMany({
      where: { storeId: brand.id },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        location: {
          select: { id: true, name: true, slug: true },
        },
        store: {
          select: { id: true, slug: true, name: true },
        },
      },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async listAll(brandSlug?: string): Promise<unknown[]> {
    const where = brandSlug
      ? { store: { slug: brandSlug.trim().toLowerCase() } }
      : {};

    return this.prisma.userStore.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        location: {
          select: { id: true, name: true, slug: true },
        },
        store: {
          select: { id: true, slug: true, name: true },
        },
      },
      orderBy: [
        { store: { name: 'asc' } },
        { isActive: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  async inviteToStores(
    dto: {
      email: string;
      firstName: string;
      lastName: string;
      role: StoreMembershipRole;
      brandSlugs: string[];
      temporaryPassword?: string;
    },
    actor: AuthenticatedUser,
  ): Promise<{
    invited: unknown[];
    failed: Array<{ slug: string; reason: string }>;
    temporaryPassword?: string;
  }> {
    const slugs = [
      ...new Set(dto.brandSlugs.map((slug) => slug.trim().toLowerCase()).filter(Boolean)),
    ];
    if (slugs.length === 0) {
      throw new BadRequestException('At least one store is required.');
    }

    const temporaryPassword = dto.temporaryPassword ?? this.generateTemporaryPassword();
    const invited: unknown[] = [];
    const failed: Array<{ slug: string; reason: string }> = [];
    let createdNewUser = false;

    for (const slug of slugs) {
      try {
        const before = await this.usersService.findByEmail(dto.email.trim().toLowerCase());
        const membership = await this.invite(
          {
            email: dto.email,
            firstName: dto.firstName,
            lastName: dto.lastName,
            role: dto.role as InviteTeamMemberDto['role'],
            brandSlug: slug,
            temporaryPassword,
          },
          actor,
        );
        if (!before) {
          createdNewUser = true;
        }
        invited.push(membership);
      } catch (error) {
        failed.push({ slug, reason: (error as Error).message });
      }
    }

    return {
      invited,
      failed,
      ...(createdNewUser ? { temporaryPassword } : {}),
    };
  }

  async invite(
    dto: InviteTeamMemberDto,
    actor: AuthenticatedUser,
  ): Promise<unknown> {
    const brand = await this.resolveBrand(dto.brandSlug);
    const email = dto.email.trim().toLowerCase();

    if (dto.locationId) {
      const location = await this.prisma.location.findFirst({
        where: { id: dto.locationId, brandId: brand.id },
      });
      if (!location) {
        throw new NotFoundException('Location not found for this store.');
      }
    }

    let user = await this.usersService.findByEmail(email);
    if (!user) {
      const password = dto.temporaryPassword ?? this.generateTemporaryPassword();
      user = await this.usersService.createUser({
        email,
        password,
        firstName: dto.firstName.trim(),
        lastName: dto.lastName.trim(),
        role: UserRole.STAFF,
      });
    }

    const membership = await this.prisma.userStore.upsert({
      where: { userId_storeId: { userId: user.id, storeId: brand.id } },
      update: {
        role: dto.role,
        isActive: true,
        locationId: dto.locationId ?? null,
      },
      create: {
        userId: user.id,
        storeId: brand.id,
        role: dto.role,
        isActive: true,
        locationId: dto.locationId ?? null,
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        location: {
          select: { id: true, name: true, slug: true },
        },
        store: {
          select: { id: true, slug: true, name: true },
        },
      },
    });

    await this.auditService.log(
      actor.id,
      brand.id,
      AuditAction.MEMBERSHIP_INVITED,
      `${user.email} invited as ${dto.role}`,
      { membershipId: membership.id, role: dto.role, userId: user.id },
    );

    return membership;
  }

  async updateMembership(
    membershipId: string,
    dto: UpdateTeamMemberDto,
    actor: AuthenticatedUser,
  ): Promise<unknown> {
    const membership = await this.prisma.userStore.findUnique({
      where: { id: membershipId },
      include: { store: true },
    });
    if (!membership) {
      throw new NotFoundException('Membership not found.');
    }
    if (
      membership.role === StoreMembershipRole.PLATFORM_ADMIN &&
      dto.role !== undefined
    ) {
      throw new BadRequestException(
        'Cannot demote a platform admin via the team endpoint.',
      );
    }

    if (dto.locationId) {
      const location = await this.prisma.location.findFirst({
        where: { id: dto.locationId, brandId: membership.storeId },
      });
      if (!location) {
        throw new NotFoundException('Location not found for this store.');
      }
    }

    const updated = await this.prisma.userStore.update({
      where: { id: membershipId },
      data: {
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.locationId !== undefined
          ? { locationId: dto.locationId === null ? null : dto.locationId }
          : {}),
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
        location: {
          select: { id: true, name: true, slug: true },
        },
        store: {
          select: { id: true, slug: true, name: true },
        },
      },
    });

    const action =
      dto.isActive === false
        ? AuditAction.MEMBERSHIP_DEACTIVATED
        : AuditAction.MEMBERSHIP_UPDATED;
    await this.auditService.log(
      actor.id,
      membership.storeId,
      action,
      `Membership ${membershipId} updated`,
      { ...dto },
    );

    return updated;
  }

  private async resolveBrand(brandSlug: string) {
    const slug = brandSlug.trim().toLowerCase();
    const brand = await this.prisma.brand.findUnique({ where: { slug } });
    if (!brand) {
      throw new NotFoundException(`Store "${slug}" not found.`);
    }
    return brand;
  }

  private generateTemporaryPassword(): string {
    return randomBytes(12).toString('base64url');
  }
}
