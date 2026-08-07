import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { BrandsService } from '../brands/brands.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from './inventory.service';

@Injectable()
export class InventoryAlertsService {
  private readonly logger = new Logger(InventoryAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly brandsService: BrandsService,
    private readonly mailService: MailService,
  ) {}

  /** Melbourne morning digest — one email per brand with low stock. */
  @Cron('0 8 * * *', { timeZone: 'Australia/Melbourne' })
  async cronLowStockDigest(): Promise<void> {
    if (!this.mailService.isConfigured()) {
      this.logger.debug('Skipping low-stock cron — mail not configured.');
      return;
    }

    try {
      const result = await this.sendLowStockAlerts();
      this.logger.log(
        `Low-stock digest: ${result.sent} sent, ${result.skipped} skipped.`,
      );
    } catch (error) {
      this.logger.error(
        `Low-stock cron failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async sendLowStockAlerts(brandSlug?: string): Promise<{
    sent: number;
    skipped: number;
    details: Array<{ brand: string; to: string | null; count: number; status: string }>;
  }> {
    const brands = brandSlug
      ? [await this.brandsService.resolveBrand(brandSlug)]
      : await this.prisma.brand.findMany({
          where: { isActive: true },
          orderBy: { name: 'asc' },
        });

    let sent = 0;
    let skipped = 0;
    const details: Array<{
      brand: string;
      to: string | null;
      count: number;
      status: string;
    }> = [];

    for (const brand of brands) {
      const items = await this.inventoryService.listItems(brand.slug, {
        lowStock: true,
        includeInactive: false,
      });

      if (items.length === 0) {
        skipped += 1;
        details.push({
          brand: brand.slug,
          to: null,
          count: 0,
          status: 'no_low_stock',
        });
        continue;
      }

      const location = await this.prisma.location.findFirst({
        where: { brandId: brand.id },
        orderBy: { createdAt: 'asc' },
      });
      const to = location?.email?.trim() || null;

      if (!to) {
        skipped += 1;
        details.push({
          brand: brand.slug,
          to: null,
          count: items.length,
          status: 'missing_contact_email',
        });
        continue;
      }

      if (!this.mailService.isConfigured()) {
        skipped += 1;
        details.push({
          brand: brand.slug,
          to,
          count: items.length,
          status: 'mail_not_configured',
        });
        continue;
      }

      const lines = items
        .map(
          (item) =>
            `• ${item.name}: ${item.qtyOnHand} ${item.unit.toLowerCase()} on hand (alert at ${item.lowStockAt})`,
        )
        .join('\n');

      const subject = `[${brand.name}] Low stock alert — ${items.length} item${items.length === 1 ? '' : 's'}`;
      const text = [
        `Low stock for ${brand.name}:`,
        '',
        lines,
        '',
        'Open Inventory → Low stock to review and reorder.',
      ].join('\n');

      const html = `
        <p>Low stock for <strong>${escapeHtml(brand.name)}</strong>:</p>
        <ul>
          ${items
            .map(
              (item) =>
                `<li><strong>${escapeHtml(item.name)}</strong>: ${escapeHtml(item.qtyOnHand)} ${escapeHtml(item.unit.toLowerCase())} on hand (alert at ${escapeHtml(String(item.lowStockAt))})</li>`,
            )
            .join('')}
        </ul>
        <p>Open Inventory → Low stock to review and reorder.</p>
      `;

      await this.mailService.send({ to, subject, text, html });
      sent += 1;
      details.push({
        brand: brand.slug,
        to,
        count: items.length,
        status: 'sent',
      });
    }

    return { sent, skipped, details };
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
