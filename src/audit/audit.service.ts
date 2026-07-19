import { Injectable, Logger } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(
    actorUserId: string | null | undefined,
    storeId: string | null | undefined,
    action: AuditAction,
    message: string,
    payload?: Record<string, unknown> | null,
  ): Promise<void> {
    try {
      await this.prisma.auditEvent.create({
        data: {
          actorUserId: actorUserId ?? null,
          storeId: storeId ?? null,
          action,
          message,
          payload:
            payload === undefined || payload === null
              ? undefined
              : (payload as unknown as Prisma.InputJsonValue),
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to record audit event ${action}: ${(error as Error).message}`,
      );
    }
  }

  async list(params: { storeId?: string; limit?: number }) {
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    return this.prisma.auditEvent.findMany({
      where: params.storeId ? { storeId: params.storeId } : {},
      include: {
        actor: {
          select: { id: true, email: true, firstName: true, lastName: true },
        },
        store: {
          select: { id: true, slug: true, name: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
