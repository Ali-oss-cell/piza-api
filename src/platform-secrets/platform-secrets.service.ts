import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  decryptLinklySecret,
  encryptLinklySecret,
} from '../payments/linkly-crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  isPlatformSecretKey,
  PLATFORM_SECRET_KEYS,
  type PlatformSecretKey,
} from './platform-secret-keys';

export type PlatformSecretRow = {
  key: PlatformSecretKey;
  configured: boolean;
  /** Masked preview when configured (e.g. sk_live_…abcd). Null when empty. */
  maskedValue: string | null;
  /** True when a DB override is stored (vs env-only). */
  fromDatabase: boolean;
  source: 'database' | 'env' | 'none';
};

@Injectable()
export class PlatformSecretsService implements OnModuleInit {
  private readonly logger = new Logger(PlatformSecretsService.name);
  /** Decrypted DB overrides only (not env). */
  private readonly dbCache = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.refreshCache();
  }

  async refreshCache(): Promise<void> {
    const rows = await this.prisma.platformSecret.findMany();
    this.dbCache.clear();
    for (const row of rows) {
      if (!isPlatformSecretKey(row.key)) {
        continue;
      }
      try {
        const plain = decryptLinklySecret(this.config, row.valueEnc);
        if (plain.trim()) {
          this.dbCache.set(row.key, plain.trim());
        }
      } catch (error) {
        this.logger.warn(
          `Failed to decrypt platform secret ${row.key}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  /**
   * Resolve a secret: DB override → env. Sync for Stripe webhook verify path.
   */
  getPlain(key: PlatformSecretKey): string | undefined {
    const fromDb = this.dbCache.get(key)?.trim();
    if (fromDb) {
      return fromDb;
    }
    const fromEnv = this.config.get<string>(key)?.trim();
    return fromEnv || undefined;
  }

  async listMasked(): Promise<PlatformSecretRow[]> {
    await this.refreshCache();
    return PLATFORM_SECRET_KEYS.map((key) => {
      const fromDb = this.dbCache.has(key);
      const value = this.getPlain(key);
      const configured = Boolean(value);
      return {
        key,
        configured,
        maskedValue: configured && value ? maskSecret(key, value) : null,
        fromDatabase: fromDb,
        source: fromDb ? 'database' : value ? 'env' : 'none',
      };
    });
  }

  async upsertMany(
    updates: Array<{ key: string; value: string | null }>,
  ): Promise<PlatformSecretRow[]> {
    for (const update of updates) {
      if (!isPlatformSecretKey(update.key)) {
        throw new BadRequestException(
          `Key "${update.key}" is not allowlisted for platform secrets.`,
        );
      }

      const trimmed = update.value?.trim() ?? '';

      if (update.key === 'LINKLY_ENV' && trimmed) {
        const normalized = trimmed.toLowerCase();
        if (normalized !== 'sandbox' && normalized !== 'production') {
          throw new BadRequestException(
            'LINKLY_ENV must be "sandbox" or "production".',
          );
        }
      }

      if (!trimmed) {
        await this.prisma.platformSecret.deleteMany({
          where: { key: update.key },
        });
        this.dbCache.delete(update.key);
        continue;
      }

      const valueToStore =
        update.key === 'LINKLY_ENV' ? trimmed.toLowerCase() : trimmed;
      const valueEnc = encryptLinklySecret(this.config, valueToStore);

      await this.prisma.platformSecret.upsert({
        where: { key: update.key },
        create: { key: update.key, valueEnc },
        update: { valueEnc },
      });
      this.dbCache.set(update.key, valueToStore);
    }

    return this.listMasked();
  }
}

function maskSecret(key: PlatformSecretKey, value: string): string {
  if (key === 'LINKLY_ENV') {
    return value;
  }
  if (value.length <= 8) {
    return '••••••••';
  }
  return `${value.slice(0, 7)}…${value.slice(-4)}`;
}
