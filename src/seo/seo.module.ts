import { Module, forwardRef } from '@nestjs/common';
import { BrandsModule } from '../brands/brands.module';
import { SeoController } from './seo.controller';
import { SeoService } from './seo.service';

@Module({
  imports: [forwardRef(() => BrandsModule)],
  controllers: [SeoController],
  providers: [SeoService],
  exports: [SeoService],
})
export class SeoModule {}
