import { Module } from '@nestjs/common';
import { HqController } from './hq.controller';
import { HqService } from './hq.service';

@Module({
  controllers: [HqController],
  providers: [HqService],
  exports: [HqService],
})
export class HqModule {}
