import { BadRequestException, Injectable } from '@nestjs/common';
import { MenuItem, PosDiscountType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  deriveBasePrice,
  type SizeOptions,
} from '../menu/size-options.util';
import { PosDiscountDto } from './dto/pos-discount.dto';
import { QuoteLineDto, QuoteRequestDto } from './dto/quote-request.dto';
import { QuoteLineResult, QuoteResult } from './pricing.types';

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async quote(
    items: QuoteLineDto[],
    options?: { deliveryFee?: number; discount?: PosDiscountDto },
  ): Promise<QuoteResult> {
    const lines: QuoteLineResult[] = [];

    for (const item of items) {
      lines.push(await this.quoteLine(item));
    }

    const subtotal = this.round(
      lines.reduce((sum, line) => sum + line.lineTotal, 0),
    );
    const deliveryFee = this.round(options?.deliveryFee ?? 0);
    const discountAmount = this.resolveDiscount(subtotal, options?.discount);
    const taxAmount = 0;

    return {
      subtotal,
      deliveryFee,
      discountAmount,
      taxAmount,
      total: this.round(Math.max(0, subtotal + deliveryFee - discountAmount)),
      lines,
    };
  }

  async quoteRequest(dto: QuoteRequestDto): Promise<QuoteResult> {
    return this.quote(dto.items, { discount: dto.discount });
  }

  resolveDiscount(subtotal: number, discount?: PosDiscountDto): number {
    if (!discount) {
      return 0;
    }

    if (discount.type === PosDiscountType.COMP) {
      return this.round(subtotal);
    }

    const value = discount.value ?? 0;
    if (discount.type === PosDiscountType.PERCENT) {
      if (value < 0 || value > 100) {
        throw new BadRequestException('Percent discount must be 0–100.');
      }
      return this.round((subtotal * value) / 100);
    }

    if (value < 0) {
      throw new BadRequestException('Amount discount must be >= 0.');
    }
    return this.round(Math.min(subtotal, value));
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

  private normalizeSizeKey(size: string): keyof SizeOptions {
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
