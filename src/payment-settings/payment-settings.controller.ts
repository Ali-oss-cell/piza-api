import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { BrandSlug } from '../common/decorators/brand-slug.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { StoreManagerGuard } from '../common/guards/store-manager.guard';
import { UpdatePaymentSettingsDto } from './dto/update-payment-settings.dto';
import { PaymentSettingsService } from './payment-settings.service';

@Controller('payment-settings')
@UseGuards(JwtAuthGuard, StoreManagerGuard)
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
}
