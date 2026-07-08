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

    if (!runMigrations) {
      return;
    }

    this.logger.log('Running database migrations...');
    await execAsync('npx prisma migrate deploy');
    this.logger.log('Database migrations completed.');
  }
}
