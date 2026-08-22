import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { PlatformSecretsService } from './platform-secrets.service';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [PlatformSecretsService],
  exports: [PlatformSecretsService],
})
export class PlatformSecretsModule {}
