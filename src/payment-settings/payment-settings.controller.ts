import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { BrandSlug } from '../common/decorators/brand-slug.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../common/guards/platform-admin.guard';
import { PairLinklyDto } from './dto/pair-linkly.dto';
import { UpdatePaymentSettingsDto } from './dto/update-payment-settings.dto';
import { PaymentSettingsService } from './payment-settings.service';

@Controller('payment-settings')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class PaymentSettingsController {
  constructor(private readonly paymentSettingsService: PaymentSettingsService) {}

  @Get()
  get(@BrandSlug() brandSlug?: string) {
    return this.paymentSettingsService.getForStore(brandSlug);
  }

  @Put()
  update(
    @Body() dto: UpdatePaymentSettingsDto,
    @BrandSlug() brandSlug?: string,
  ) {
    return this.paymentSettingsService.updateForStore(dto, brandSlug);
  }

  @Post('linkly/pair')
  pairLinkly(@Body() dto: PairLinklyDto, @BrandSlug() brandSlug?: string) {
    return this.paymentSettingsService.pairLinkly(dto, brandSlug);
  }

  @Post('linkly/unpair')
  unpairLinkly(@BrandSlug() brandSlug?: string) {
    return this.paymentSettingsService.unpairLinkly(brandSlug);
  }
}
