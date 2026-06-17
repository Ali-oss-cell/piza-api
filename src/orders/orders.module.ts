import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { OrdersController } from './orders.controller';
import { OrderSchedulingService } from './order-scheduling.service';
import { OrdersService } from './orders.service';

@Module({
  imports: [SettingsModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderSchedulingService],
})
export class OrdersModule {}
