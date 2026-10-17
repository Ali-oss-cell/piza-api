import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { BrandsModule } from '../brands/brands.module';
import { MailModule } from '../mail/mail.module';
import { EmailSettingsController } from './email-settings.controller';
import { EmailSettingsService } from './email-settings.service';

@Module({
  imports: [AuditModule, BrandsModule, MailModule],
  controllers: [EmailSettingsController],
  providers: [EmailSettingsService],
  exports: [EmailSettingsService],
})
export class EmailSettingsModule {}
