import { Global, Module } from '@nestjs/common';
import { PlatformAdminGuard } from '../common/guards/platform-admin.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { StoreManagerGuard } from '../common/guards/store-manager.guard';
import { StoreAccessService } from '../common/services/store-access.service';
import { BrandsController } from './brands.controller';
import { BrandsService } from './brands.service';

@Global()
@Module({
  controllers: [BrandsController],
  providers: [
    BrandsService,
    StoreAccessService,
    RolesGuard,
    PlatformAdminGuard,
    StoreManagerGuard,
  ],
  exports: [
    BrandsService,
    StoreAccessService,
    RolesGuard,
    PlatformAdminGuard,
    StoreManagerGuard,
  ],
})
export class BrandsModule {}
