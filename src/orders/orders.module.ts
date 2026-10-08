import { Module } from '@nestjs/common';
import { CrmModule } from '../crm/crm.module';
import { DealsModule } from '../deals/deals.module';
import { PaymentSettingsModule } from '../payment-settings/payment-settings.module';
import { PaymentsModule } from '../payments/payments.module';
import { SettingsModule } from '../settings/settings.module';
import { OrdersController } from './orders.controller';
import { OrderSchedulingService } from './order-scheduling.service';
import { OrdersService } from './orders.service';

@Module({
  imports: [SettingsModule, CrmModule, DealsModule, PaymentsModule, PaymentSettingsModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderSchedulingService],
})
export class OrdersModule {}
