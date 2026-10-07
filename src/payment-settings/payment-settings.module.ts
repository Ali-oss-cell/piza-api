import { Module } from '@nestjs/common';
import { BrandsModule } from '../brands/brands.module';
import { AuditModule } from '../audit/audit.module';
import { PaymentsModule } from '../payments/payments.module';
import { PlatformSecretsModule } from '../platform-secrets/platform-secrets.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PaymentSettingsController } from './payment-settings.controller';
import { PaymentSettingsService } from './payment-settings.service';

@Module({
  imports: [
    PrismaModule,
    BrandsModule,
    AuditModule,
    PaymentsModule,
    PlatformSecretsModule,
  ],
  controllers: [PaymentSettingsController],
  providers: [PaymentSettingsService],
  exports: [PaymentSettingsService],
})
export class PaymentSettingsModule {}
