import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { BrandSlug } from '../common/decorators/brand-slug.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  updateStoreSettings(
    @Body() dto: UpdateStoreSettingsDto,
    @BrandSlug() brandSlug?: string,
  ) {
    return this.settingsService.updateStoreSettings(dto, brandSlug);
  }
}
