import { BadRequestException } from '@nestjs/common';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

export async function findUsersByPosCode(
  prisma: PrismaService,
  pin: string,
): Promise<User[]> {
  const candidates = await prisma.user.findMany({
    where: { posPinHash: { not: null } },
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

export async function assertUniquePosCode(
  prisma: PrismaService,
  pin: string,
  exceptUserId?: string,
): Promise<void> {
  const matches = await findUsersByPosCode(prisma, pin);
  const clash = matches.find((user) => user.id !== exceptUserId);
  if (clash) {
    throw new BadRequestException(
      'Another employee already uses this code. Pick a different one.',
    );
  }
}
