import { Module } from '@nestjs/common';
import { CrmModule } from '../crm/crm.module';
import { PaymentsModule } from '../payments/payments.module';
import { PaymentSettingsModule } from '../payment-settings/payment-settings.module';
import { PricingModule } from '../pricing/pricing.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PosController } from './pos.controller';
import { PosService } from './pos.service';

@Module({
  imports: [PrismaModule, PricingModule, PaymentsModule, PaymentSettingsModule, CrmModule],
  controllers: [PosController],
  providers: [PosService],
})
export class PosModule {}
