import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { CrmService } from '../crm/crm.service';

const execAsync = promisify(exec);

@Injectable()
export class DatabaseBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseBootstrapService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly moduleRef: ModuleRef,
  ) {}

  async onModuleInit(): Promise<void> {
    const runMigrations =
      this.configService.get<string>('RUN_MIGRATIONS', 'false') === 'true';

    if (runMigrations) {
      this.logger.log('Running database migrations...');
      await execAsync('npx prisma migrate deploy');
      this.logger.log('Database migrations completed.');
    }

    const runCrmBackfill =
      this.configService.get<string>('RUN_CRM_BACKFILL', 'false') === 'true';

    if (runCrmBackfill) {
      try {
        const crmService = this.moduleRef.get(CrmService, { strict: false });
        this.logger.log('Running CRM customer backfill...');
        const results = await crmService.backfillAll();
        this.logger.log(`CRM backfill complete: ${JSON.stringify(results)}`);
      } catch (error) {
        this.logger.error(
          `CRM backfill failed: ${(error as Error).message}`,
        );
      }
    }
  }
}
