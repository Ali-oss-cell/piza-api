import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { MailModule } from '../mail/mail.module';
import { InventoryAlertsService } from './inventory-alerts.service';
import { InventoryController } from './inventory.controller';
import { InventoryPurchasingService } from './inventory-purchasing.service';
import { InventoryService } from './inventory.service';

@Module({
  imports: [AuditModule, MailModule],
  controllers: [InventoryController],
  providers: [
    InventoryService,
    InventoryPurchasingService,
    InventoryAlertsService,
  ],
  exports: [InventoryService, InventoryPurchasingService],
})
export class InventoryModule {}
