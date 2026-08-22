import { Global, Module, forwardRef } from '@nestjs/common';
import { PlatformAdminGuard } from '../common/guards/platform-admin.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SeoAccessGuard } from '../common/guards/seo-access.guard';
import { StoreManagerGuard } from '../common/guards/store-manager.guard';
import { StoreAccessService } from '../common/services/store-access.service';
import { SeoModule } from '../seo/seo.module';
import { BrandsController } from './brands.controller';
import { BrandsService } from './brands.service';

@Global()
@Module({
  imports: [forwardRef(() => SeoModule)],
  controllers: [BrandsController],
  providers: [
    BrandsService,
    StoreAccessService,
    RolesGuard,
    PlatformAdminGuard,
    StoreManagerGuard,
    SeoAccessGuard,
  ],
  exports: [
    BrandsService,
    StoreAccessService,
    RolesGuard,
    PlatformAdminGuard,
    StoreManagerGuard,
    SeoAccessGuard,
  ],
})
export class BrandsModule {}
