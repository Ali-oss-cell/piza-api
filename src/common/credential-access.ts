import { ForbiddenException } from '@nestjs/common';
import { StoreMembershipRole, UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Who may change another person's login details (email, password, POS code).
 *
 * - A global ADMIN on a full (non-PIN) session may change anyone.
 * - Anyone else must manage a store the target belongs to, the target must not
 *   be a global ADMIN, and the target must not belong to any store the caller
 *   doesn't manage. Otherwise a store admin could set a code on someone with
 *   wider access and then sign in as them.
 */
export async function assertCanChangeCredentials(
  prisma: PrismaService,
  actor: AuthenticatedUser,
  targetUserId: string,
): Promise<void> {
  if (actor.id === targetUserId) {
    return;
  }
  if (actor.role === UserRole.ADMIN && actor.scope !== 'pos') {
    return;
  }

  const target = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      role: true,
      storeMemberships: {
        where: { isActive: true },
        select: { storeId: true, role: true },
      },
    },
  });
  if (!target) {
    throw new ForbiddenException('You cannot change login details for this person.');
  }
  if (
    target.role === UserRole.ADMIN ||
    target.storeMemberships.some(
      (m) => m.role === StoreMembershipRole.PLATFORM_ADMIN,
    )
  ) {
    throw new ForbiddenException('You cannot change login details for this person.');
  }

  const managed = await prisma.userStore.findMany({
    where: {
      userId: actor.id,
      isActive: true,
      role: {
        in: [StoreMembershipRole.STORE_ADMIN, StoreMembershipRole.PLATFORM_ADMIN],
      },
      ...(actor.scope === 'pos' ? { storeId: actor.storeId } : {}),
    },
    select: { storeId: true },
  });
  const managedIds = new Set(managed.map((m) => m.storeId));

  const targetStores = target.storeMemberships.map((m) => m.storeId);
  const sharesStore = targetStores.some((id) => managedIds.has(id));
  const allManaged = targetStores.every((id) => managedIds.has(id));
  if (!sharesStore || !allManaged) {
    throw new ForbiddenException('You cannot change login details for this person.');
  }
}
