import { Module } from '@nestjs/common';
import { SeoModule } from '../seo/seo.module';
import { UploadsController } from './uploads.controller';

@Module({
  imports: [SeoModule],
  controllers: [UploadsController],
})
export class UploadsModule {}
