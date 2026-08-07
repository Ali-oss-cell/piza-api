import { Module } from '@nestjs/common';
import { TeamModule } from '../team/team.module';
import { CorsOriginsService } from './cors-origins.service';
import { HqController } from './hq.controller';
import { HqService } from './hq.service';
import { TraefikDomainsSyncService } from './traefik-domains-sync.service';

@Module({
  imports: [TeamModule],
  controllers: [HqController],
  providers: [HqService, TraefikDomainsSyncService, CorsOriginsService],
  exports: [HqService, CorsOriginsService, TraefikDomainsSyncService],
})
export class HqModule {}
