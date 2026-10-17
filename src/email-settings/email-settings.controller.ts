import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { BrandSlug } from '../common/decorators/brand-slug.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../common/guards/platform-admin.guard';
import {
  SendTestEmailDto,
  UpdateEmailSettingsDto,
} from './dto/update-email-settings.dto';
import { EmailSettingsService } from './email-settings.service';

@Controller('email-settings')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class EmailSettingsController {
  constructor(private readonly emailSettingsService: EmailSettingsService) {}

  @Get()
  get(@BrandSlug() brandSlug?: string) {
    return this.emailSettingsService.getForStore(brandSlug);
  }

  @Put()
  update(
    @Body() dto: UpdateEmailSettingsDto,
    @BrandSlug() brandSlug?: string,
  ) {
    return this.emailSettingsService.updateForStore(dto, brandSlug);
  }

  @Post('test')
  test(@Body() dto: SendTestEmailDto, @BrandSlug() brandSlug?: string) {
    return this.emailSettingsService.sendTest(dto.to, brandSlug);
  }
}
