import { BadRequestException, Injectable } from '@nestjs/common';
import {
  ComboDeal,
  ComboDealSlot,
  ComboSlotSourceType,
  MenuItem,
  PosDiscountType,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  deriveBasePrice,
  type SizeOptions,
} from '../menu/size-options.util';
import { ComboSelectionDto } from './dto/combo-selection.dto';
import { PosDiscountDto } from './dto/pos-discount.dto';
import { QuoteLineDto, QuoteRequestDto } from './dto/quote-request.dto';
import { QuoteLineResult, QuoteResult } from './pricing.types';

type ComboDealWithSlots = ComboDeal & { slots: ComboDealSlot[] };

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async quote(
    items: QuoteLineDto[],
    options?: { deliveryFee?: number; discount?: PosDiscountDto },
  ): Promise<QuoteResult> {
    const lines: QuoteLineResult[] = [];

    for (const item of items) {
      const lineType =
        item.type ?? (item.comboDealId ? 'COMBO' : 'ITEM');
      if (lineType === 'COMBO') {
        lines.push(...(await this.quoteCombo(item)));
      } else {
        lines.push(await this.quoteLine(item));
      }
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
    if (!item.menuItemId) {
      throw new BadRequestException('menuItemId is required for ITEM lines');
    }
    const quantity = item.quantity ?? 1;

    const menuItem = await this.prisma.menuItem.findUnique({
      where: { id: item.menuItemId },
    });

    if (!menuItem || !menuItem.isActive) {
      throw new BadRequestException(`Menu item not found: ${item.menuItemId}`);
    }

    const unitPrice = await this.resolveUnitPrice(menuItem, item);
    const lineTotal = this.round(unitPrice * quantity);

    return {
      type: 'ITEM',
      menuItemId: menuItem.id,
      name: menuItem.name,
      quantity,
      unitPrice,
      lineTotal,
      size: item.size,
      crust: item.crust,
      toppingIds: item.toppingIds ?? [],
      removedIngredients: item.removedIngredients ?? [],
    };
  }

  private async quoteCombo(item: QuoteLineDto): Promise<QuoteLineResult[]> {
    if (!item.comboDealId || !item.selections?.length) {
      throw new BadRequestException(
        'comboDealId and selections are required for COMBO lines',
      );
    }

    const deal = await this.prisma.comboDeal.findUnique({
      where: { id: item.comboDealId },
      include: { slots: { orderBy: { sortOrder: 'asc' } } },
    });

    if (!deal || !deal.isActive) {
      throw new BadRequestException(`Combo deal not found: ${item.comboDealId}`);
    }

    const now = new Date();
    if (
      (deal.validFrom && deal.validFrom > now) ||
      (deal.validUntil && deal.validUntil < now)
    ) {
      throw new BadRequestException(`Combo deal is not currently available`);
    }

    await this.validateComboSelections(deal, item.selections);

    let extrasTotal = 0;
    const children: QuoteLineResult[] = [];
    const instanceId = randomUUID();

    for (const selection of item.selections) {
      const slot = deal.slots.find((s) => s.id === selection.slotId);
      if (!slot) {
        throw new BadRequestException(`Unknown combo slot: ${selection.slotId}`);
      }

      const menuItem = await this.prisma.menuItem.findUnique({
        where: { id: selection.menuItemId },
      });
      if (!menuItem || !menuItem.isActive) {
        throw new BadRequestException(
          `Menu item not found: ${selection.menuItemId}`,
        );
      }

      if (!slot.allowModifiers) {
        if (
          (selection.toppingIds?.length ?? 0) > 0 ||
          (selection.removedIngredients?.length ?? 0) > 0 ||
          selection.crust
        ) {
          throw new BadRequestException(
            `Modifiers are not allowed for slot "${slot.label}"`,
          );
        }
      }

      const modifierDelta = slot.allowModifiers
        ? await this.modifierExtras(menuItem, selection)
        : 0;
      extrasTotal = this.round(extrasTotal + modifierDelta);

      children.push({
        type: 'COMBO',
        menuItemId: menuItem.id,
        name: `${deal.name}: ${menuItem.name}`,
        quantity: 1,
        unitPrice: 0,
        lineTotal: 0,
        size: selection.size,
        crust: selection.crust,
        toppingIds: selection.toppingIds ?? [],
        removedIngredients: selection.removedIngredients ?? [],
        comboDealId: deal.id,
        comboInstanceId: instanceId,
        isComboHeader: false,
      });
    }

    const unitPrice = this.round(Number(deal.bundlePrice) + extrasTotal);

    const header: QuoteLineResult = {
      type: 'COMBO',
      menuItemId: null,
      name: deal.name,
      quantity: 1,
      unitPrice,
      lineTotal: unitPrice,
      toppingIds: [],
      removedIngredients: [],
      comboDealId: deal.id,
      comboInstanceId: instanceId,
      isComboHeader: true,
    };

    return [header, ...children];
  }

  private async validateComboSelections(
    deal: ComboDealWithSlots,
    selections: ComboSelectionDto[],
  ): Promise<void> {
    const required: string[] = [];
    for (const slot of deal.slots) {
      for (let i = 0; i < slot.quantity; i++) {
        required.push(slot.id);
      }
    }

    if (selections.length !== required.length) {
      throw new BadRequestException(
        `Combo "${deal.name}" requires ${required.length} selections, got ${selections.length}`,
      );
    }

    const remaining = [...required];
    for (const selection of selections) {
      const idx = remaining.indexOf(selection.slotId);
      if (idx === -1) {
        throw new BadRequestException(
          `Unexpected or duplicate selection for slot ${selection.slotId}`,
        );
      }
      remaining.splice(idx, 1);

      const slot = deal.slots.find((s) => s.id === selection.slotId)!;
      const menuItem = await this.prisma.menuItem.findFirst({
        where: { id: selection.menuItemId, isActive: true },
      });
      if (!menuItem) {
        throw new BadRequestException(
          `Menu item not found: ${selection.menuItemId}`,
        );
      }
      if (menuItem.brandId !== deal.brandId) {
        throw new BadRequestException('Menu item does not belong to this store');
      }

      if (slot.sourceType === ComboSlotSourceType.ITEM) {
        if (slot.menuItemId !== selection.menuItemId) {
          throw new BadRequestException(
            `Slot "${slot.label}" requires a specific menu item`,
          );
        }
      } else if (slot.sourceType === ComboSlotSourceType.CATEGORY) {
        if (menuItem.categorySlug !== slot.categorySlug) {
          throw new BadRequestException(
            `Slot "${slot.label}" requires an item from ${slot.categorySlug}`,
          );
        }
      }

      const allowedSizes = this.parseAllowedSizes(slot.allowedSizes);
      if (allowedSizes.length > 0) {
        if (!selection.size) {
          throw new BadRequestException(
            `Slot "${slot.label}" requires a size (${allowedSizes.join(', ')})`,
          );
        }
        const key = this.normalizeSizeKey(selection.size);
        if (!allowedSizes.includes(key)) {
          throw new BadRequestException(
            `Slot "${slot.label}" does not allow size "${selection.size}"`,
          );
        }
      }
    }
  }

  private parseAllowedSizes(value: unknown): string[] {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.map((v) => String(v).toLowerCase());
    }
    return [];
  }

  private async modifierExtras(
    menuItem: MenuItem,
    selection: ComboSelectionDto,
  ): Promise<number> {
    let price = 0;

    if (selection.crust) {
      const crust = await this.prisma.crustOption.findFirst({
        where: { slug: selection.crust, isActive: true },
      });
      if (crust) {
        price += Number(crust.priceDelta);
      }
    }

    for (const toppingId of selection.toppingIds ?? []) {
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
