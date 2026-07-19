import { Module } from '@nestjs/common';
import { LocationsAdminController } from './locations-admin.controller';
import { LocationsAdminService } from './locations-admin.service';

@Module({
  controllers: [LocationsAdminController],
  providers: [LocationsAdminService],
  exports: [LocationsAdminService],
})
export class LocationsAdminModule {}
