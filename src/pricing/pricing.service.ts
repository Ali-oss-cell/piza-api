import { BadRequestException, Injectable } from '@nestjs/common';
import { MenuItem } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  deriveBasePrice,
  type SizeOptions,
} from '../menu/size-options.util';
import { QuoteLineDto } from './dto/quote-request.dto';
import { QuoteLineResult, QuoteResult } from './pricing.types';

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async quote(
    items: QuoteLineDto[],
    options?: { deliveryFee?: number },
  ): Promise<QuoteResult> {
    const lines: QuoteLineResult[] = [];

    for (const item of items) {
      lines.push(await this.quoteLine(item));
    }

    const subtotal = this.round(
      lines.reduce((sum, line) => sum + line.lineTotal, 0),
    );
    const deliveryFee = this.round(options?.deliveryFee ?? 0);
    const discountAmount = 0;
    const taxAmount = 0;

    return {
      subtotal,
      deliveryFee,
      discountAmount,
      taxAmount,
      total: this.round(subtotal + deliveryFee - discountAmount),
      lines,
    };
  }

  private async quoteLine(item: QuoteLineDto): Promise<QuoteLineResult> {
    const menuItem = await this.prisma.menuItem.findUnique({
      where: { id: item.menuItemId },
    });

    if (!menuItem || !menuItem.isActive) {
      throw new BadRequestException(`Menu item not found: ${item.menuItemId}`);
    }

    const unitPrice = await this.resolveUnitPrice(menuItem, item);
    const lineTotal = this.round(unitPrice * item.quantity);

    return {
      menuItemId: menuItem.id,
      name: menuItem.name,
      quantity: item.quantity,
      unitPrice,
      lineTotal,
      size: item.size,
      crust: item.crust,
      toppingIds: item.toppingIds ?? [],
      removedIngredients: item.removedIngredients ?? [],
    };
  }

  private async resolveUnitPrice(
    menuItem: MenuItem,
    item: QuoteLineDto,
  ): Promise<number> {
    let price = this.basePriceForSize(menuItem, item.size);

    if (item.crust) {
      const crust = await this.prisma.crustOption.findFirst({
        where: { slug: item.crust, isActive: true },
      });

      if (crust) {
        price += Number(crust.priceDelta);
      }
    }

    for (const toppingId of item.toppingIds ?? []) {
      const topping = await this.prisma.extraTopping.findFirst({
        where: {
          OR: [{ id: toppingId }, { slug: toppingId }],
          isActive: true,
        },
      });

      if (topping) {
        price += Number(topping.priceDelta);
      }
    }

    return this.round(price);
  }

  private basePriceForSize(menuItem: MenuItem, size?: string): number {
    const sizeOptions = menuItem.sizeOptions as SizeOptions | null;

    if (size && sizeOptions) {
      const key = this.normalizeSizeKey(size);
      const option = sizeOptions[key];

      if (option?.enabled) {
        return option.price;
      }
    }

    if (sizeOptions) {
      return deriveBasePrice(sizeOptions);
    }

    return Number(menuItem.price);
  }

  private normalizeSizeKey(
    size: string,
  ): keyof SizeOptions {
    const normalized = size.toLowerCase();

    if (normalized.startsWith('s')) {
      return 'small';
    }

    if (normalized.startsWith('f')) {
      return 'family';
    }

    return 'large';
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
