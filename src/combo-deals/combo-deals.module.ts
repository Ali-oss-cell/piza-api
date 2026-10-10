import { Module } from '@nestjs/common';
import { ComboDealsController } from './combo-deals.controller';
import { ComboDealsService } from './combo-deals.service';

@Module({
  controllers: [ComboDealsController],
  providers: [ComboDealsService],
  exports: [ComboDealsService],
})
export class ComboDealsModule {}
