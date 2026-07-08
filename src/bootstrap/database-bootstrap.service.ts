import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

@Injectable()
export class DatabaseBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseBootstrapService.name);

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const runMigrations =
      this.configService.get<string>('RUN_MIGRATIONS', 'false') === 'true';
    const runSeed =
      this.configService.get<string>('RUN_SEED', 'false') === 'true';

    if (!runMigrations && !runSeed) {
      return;
    }

    if (runMigrations) {
      this.logger.log('Running database migrations...');
      await execAsync('npx prisma migrate deploy');
      this.logger.log('Database migrations completed.');
    }

    if (runSeed) {
      this.logger.log('Running database seed...');
      await execAsync('node prisma/seed.js');
      this.logger.log('Database seed completed.');
    }
  }
}
