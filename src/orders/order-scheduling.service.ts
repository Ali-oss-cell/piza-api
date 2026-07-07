import { BadRequestException, Injectable } from '@nestjs/common';
import { DeliveryMode } from '@prisma/client';
import { SettingsService } from '../settings/settings.service';
import {
  isWithinOpeningHours,
  parseOpeningHours,
} from './opening-hours.types';

const DEFAULT_LEAD_TIME_MINUTES = 45;

@Injectable()
export class OrderSchedulingService {
  constructor(private readonly settingsService: SettingsService) {}

  async assertScheduledAtValid(
    scheduledAt: Date,
    brandSlug?: string,
  ): Promise<void> {
    const settings = await this.settingsService.findStoreSettings(brandSlug);
    const openingHours = parseOpeningHours(settings.openingHours);
    const timezone = openingHours?.timezone ?? 'Australia/Melbourne';
    const leadTimeMinutes =
      openingHours?.leadTimeMinutes ?? DEFAULT_LEAD_TIME_MINUTES;

    const now = new Date();
    const earliest = new Date(now.getTime() + leadTimeMinutes * 60_000);

    if (scheduledAt.getTime() < earliest.getTime()) {
      throw new BadRequestException(
        `Please choose a time at least ${leadTimeMinutes} minutes from now.`,
      );
    }

    if (!openingHours) {
      return;
    }

    if (!isWithinOpeningHours(scheduledAt, openingHours)) {
      throw new BadRequestException(
        'Selected time is outside our opening hours. Please choose another slot.',
      );
    }
  }

  assertDeliveryAddress(
    deliveryMode: DeliveryMode,
    address: {
      deliveryAddressLine1?: string;
      deliverySuburb?: string;
      deliveryPostcode?: string;
    },
  ): void {
    if (deliveryMode !== DeliveryMode.DELIVERY) {
      return;
    }

    if (
      !address.deliveryAddressLine1?.trim() ||
      !address.deliverySuburb?.trim() ||
      !address.deliveryPostcode?.trim()
    ) {
      throw new BadRequestException(
        'Delivery address, suburb, and postcode are required for delivery orders.',
      );
    }
  }

  async assertMinOrderAmount(subtotal: number, brandSlug?: string): Promise<void> {
    const settings = await this.settingsService.findStoreSettings(brandSlug);
    const minOrder = Number(settings.minOrderAmount);

    if (subtotal < minOrder) {
      throw new BadRequestException(
        `Minimum order amount is $${minOrder.toFixed(2)}.`,
      );
    }
  }
}
