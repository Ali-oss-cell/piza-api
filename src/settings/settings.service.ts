import { Injectable, NotFoundException } from '@nestjs/common';
import { StoreSettings } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateStoreSettingsDto } from './dto/update-store-settings.dto';

const SETTINGS_ID = '00000000-0000-0000-0000-000000000001';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findStoreSettings(): Promise<StoreSettings> {
    const settings = await this.prisma.storeSettings.findUnique({
      where: { id: SETTINGS_ID },
    });

    if (!settings) {
      throw new NotFoundException('Store settings not found');
    }

    return settings;
  }

  async updateStoreSettings(dto: UpdateStoreSettingsDto): Promise<StoreSettings> {
    await this.findStoreSettings();

    return this.prisma.storeSettings.update({
      where: { id: SETTINGS_ID },
      data: {
        ...(dto.storeName !== undefined ? { storeName: dto.storeName.trim() } : {}),
        ...(dto.tagline !== undefined ? { tagline: dto.tagline.trim() || null } : {}),
        ...(dto.deliveryFee !== undefined ? { deliveryFee: dto.deliveryFee } : {}),
        ...(dto.minOrderAmount !== undefined ? { minOrderAmount: dto.minOrderAmount } : {}),
        ...(dto.contactEmail !== undefined
          ? { contactEmail: dto.contactEmail.trim() || null }
          : {}),
        ...(dto.contactPhone !== undefined
          ? { contactPhone: dto.contactPhone.trim() || null }
          : {}),
        ...(dto.address !== undefined ? { address: dto.address.trim() || null } : {}),
      },
    });
  }
}
