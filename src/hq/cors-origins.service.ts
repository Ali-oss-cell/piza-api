import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CorsOriginsService implements OnModuleInit {
  private readonly logger = new Logger(CorsOriginsService.name);
  private origins = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<string[]> {
    const baseline = this.baselineOrigins();
    const configured = this.configuredOrigins();

    let domainHosts: string[] = [];
    try {
      const rows = await this.prisma.storeDomain.findMany({
        where: {
          isActive: true,
          host: { not: null },
          store: { isActive: true },
        },
        select: { host: true },
      });
      domainHosts = rows
        .map((row) => row.host?.trim().toLowerCase() ?? '')
        .filter(Boolean)
        .map((host) => `https://${host}`);
    } catch (error) {
      this.logger.warn(
        `CORS domain refresh failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    this.origins = new Set([...baseline, ...configured, ...domainHosts]);
    return [...this.origins];
  }

  list(): string[] {
    return [...this.origins];
  }

  isAllowed(origin: string | undefined): boolean {
    if (!origin) {
      return true;
    }
    return this.origins.has(origin);
  }

  private configuredOrigins(): string[] {
    const corsOrigin = this.config.get<string>(
      'CORS_ORIGIN',
      'http://localhost:3000',
    );
    return corsOrigin
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean);
  }

  private baselineOrigins(): string[] {
    const web = this.config.get<string>('WEB_DOMAIN')?.trim();
    const www = this.config.get<string>('WEB_WWW_DOMAIN')?.trim();
    const admin = this.config.get<string>('ADMIN_DOMAIN')?.trim();
    const pos = this.config.get<string>('POS_DOMAIN')?.trim();

    return [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'https://marinapizzas.com.au',
      'https://www.marinapizzas.com.au',
      'https://admin.marinapizzas.com.au',
      'https://pos.marinapizzas.com.au',
      ...(web ? [`https://${web}`] : []),
      ...(www ? [`https://${www}`] : []),
      ...(admin ? [`https://${admin}`] : []),
      ...(pos ? [`https://${pos}`] : []),
    ];
  }
}
