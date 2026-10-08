import { BadRequestException } from '@nestjs/common';
import { User, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Staff who can unlock the register of one store with this code.
 * Scoped to active members of that store so a guess only ever runs a handful
 * of bcrypt compares, and global ADMIN accounts can never be opened by a PIN.
 */
export async function findUsersByPosCode(
  prisma: PrismaService,
  pin: string,
  storeId: string,
): Promise<User[]> {
  const candidates = await prisma.user.findMany({
    where: {
      posPinHash: { not: null },
      role: { not: UserRole.ADMIN },
      storeMemberships: { some: { storeId, isActive: true } },
    },
    omit: { posPinHash: false },
  });
  const matches: User[] = [];
  for (const user of candidates) {
    if (!user.posPinHash) continue;
    if (await bcrypt.compare(pin, user.posPinHash)) {
      matches.push(user);
    }
  }
  return matches;
}

/** A code must be unique among everyone who shares a store with this user. */
export async function assertUniquePosCode(
  prisma: PrismaService,
  pin: string,
  userId: string,
): Promise<void> {
  const memberships = await prisma.userStore.findMany({
    where: { userId, isActive: true },
    select: { storeId: true },
  });
  for (const { storeId } of memberships) {
    const matches = await findUsersByPosCode(prisma, pin, storeId);
    if (matches.some((user) => user.id !== userId)) {
      throw new BadRequestException('Pick a different code.');
    }
  }
}
