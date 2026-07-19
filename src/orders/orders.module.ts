import { Module } from '@nestjs/common';
import { CrmModule } from '../crm/crm.module';
import { SettingsModule } from '../settings/settings.module';
import { OrdersController } from './orders.controller';
import { OrderSchedulingService } from './order-scheduling.service';
import { OrdersService } from './orders.service';

@Module({
  imports: [SettingsModule, CrmModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderSchedulingService],
})
export class OrdersModule {}
