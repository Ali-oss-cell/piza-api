#!/usr/bin/env node
/**
 * Load the Weekly Stock Order Sheet catalogue (11 categories / 65 items)
 * into a store's stock items. Idempotent: existing items (matched by name)
 * only get their sheet fields refreshed; qty/cost/vendor are never touched.
 *
 *   docker compose -f docker-compose.prod.yml exec -T api \
 *     node scripts/seed-weekly-stock-sheet.mjs benny-boys
 *
 * The same thing is available in the dashboard: Inventory -> Weekly order ->
 * "Load standard sheet items".
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient, Prisma } = require('@prisma/client');
const {
  WEEKLY_SHEET_CATALOG,
} = require('../dist/src/inventory/weekly-sheet-catalog.js');

async function main() {
  const slug = process.argv.slice(2).find((a) => !a.startsWith('--'));
  if (!slug) {
    console.error('Usage: node scripts/seed-weekly-stock-sheet.mjs <brand-slug>');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const brand = await prisma.brand.findUnique({ where: { slug } });
    if (!brand) {
      console.error(`Store "${slug}" not found.`);
      process.exit(1);
    }

    let created = 0;
    let updated = 0;
    let order = 0;

    for (const category of WEEKLY_SHEET_CATALOG) {
      for (const item of category.items) {
        order += 1;
        const guide =
          item.guide === null ? null : new Prisma.Decimal(item.guide);
        const existing = await prisma.stockItem.findUnique({
          where: { brandId_name: { brandId: brand.id, name: item.name } },
        });
        if (existing) {
          await prisma.stockItem.update({
            where: { id: existing.id },
            data: {
              category: category.name,
              packSize: item.packSize,
              guideQty: guide,
              sheetOrder: order,
            },
          });
          updated += 1;
        } else {
          await prisma.stockItem.create({
            data: {
              brandId: brand.id,
              name: item.name,
              category: category.name,
              unit: item.unit,
              packSize: item.packSize,
              guideQty: guide,
              sheetOrder: order,
            },
          });
          created += 1;
        }
      }
    }

    console.log(
      `${brand.name}: ${created} created, ${updated} updated (${order} sheet items).`,
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
