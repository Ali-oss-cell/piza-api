import { Module } from '@nestjs/common';
import { TeamModule } from '../team/team.module';
import { HqController } from './hq.controller';
import { HqService } from './hq.service';

@Module({
  imports: [TeamModule],
  controllers: [HqController],
  providers: [HqService],
  exports: [HqService],
})
export class HqModule {}
