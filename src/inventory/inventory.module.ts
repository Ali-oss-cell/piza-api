import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { InventoryController } from './inventory.controller';
import { InventoryPurchasingService } from './inventory-purchasing.service';
import { InventoryService } from './inventory.service';

@Module({
  imports: [AuditModule],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryPurchasingService],
  exports: [InventoryService, InventoryPurchasingService],
})
export class InventoryModule {}
