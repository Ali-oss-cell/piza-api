import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { BrandSlug } from '../common/decorators/brand-slug.decorator';
import { LocationId } from '../common/decorators/location-id.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { StoreManagerGuard } from '../common/guards/store-manager.guard';
import { UpdateStoreSettingsDto } from './dto/update-store-settings.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  findStoreSettings(
    @BrandSlug() brandSlug?: string,
    @LocationId() locationId?: string,
  ) {
    return this.settingsService.findStoreSettings(brandSlug, locationId);
  }

  @Get('ops-report')
  @UseGuards(JwtAuthGuard, StoreManagerGuard)
  opsReport(
    @BrandSlug() brandSlug?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.settingsService.getOpsReport(brandSlug, from, to);
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
