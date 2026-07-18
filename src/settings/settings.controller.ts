import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { BrandSlug } from '../common/decorators/brand-slug.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { StoreManagerGuard } from '../common/guards/store-manager.guard';
import { UpdateStoreSettingsDto } from './dto/update-store-settings.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  findStoreSettings(@BrandSlug() brandSlug?: string) {
    return this.settingsService.findStoreSettings(brandSlug);
  }

  @Put()
  @UseGuards(JwtAuthGuard, StoreManagerGuard)
  updateStoreSettings(
    @Body() dto: UpdateStoreSettingsDto,
    @BrandSlug() brandSlug?: string,
  ) {
    return this.settingsService.updateStoreSettings(dto, brandSlug);
  }
}
