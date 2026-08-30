#!/usr/bin/env node
/**
 * Delete one or more stores (brands) from Postgres.
 *
 * Run on the Droplet inside the api container:
 *   cd ~/piza/piza-api
 *   docker compose -f docker-compose.prod.yml exec -T api node scripts/delete-stores.mjs --list
 *   docker compose -f docker-compose.prod.yml exec -T api node scripts/delete-stores.mjs --all
 *
 * If the api image was built before this script existed, copy it in once:
 *   docker compose -f docker-compose.prod.yml cp scripts/delete-stores.mjs api:/app/scripts/delete-stores.mjs
 *   docker compose -f docker-compose.prod.yml exec -T api node scripts/delete-stores.mjs --all
 *
 * Or use SQL (no script needed) — see README in docs/benny-boys/
 */
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

async function main() {
  const args = process.argv.slice(2);
  const listOnly = args.includes('--list');
  const deleteAll = args.includes('--all');
  const slugs = args.filter((a) => !a.startsWith('--'));

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const brands = await prisma.brand.findMany({
      select: { id: true, slug: true, name: true, status: true, isActive: true },
      orderBy: { slug: 'asc' },
    });

    console.log('Current stores:');
    if (brands.length === 0) {
      console.log('  (none)');
    }
    for (const b of brands) {
      console.log(
        `  ${b.slug.padEnd(20)} ${b.name}  [${b.status}] active=${b.isActive}  id=${b.id}`,
      );
    }

    if (listOnly) {
      return;
    }

    let targets = slugs;
    if (deleteAll) {
      targets = brands.map((b) => b.slug);
    }

    if (targets.length === 0) {
      console.log('\nNothing to delete. Examples:');
      console.log('  node scripts/delete-stores.mjs --all');
      console.log('  node scripts/delete-stores.mjs benny-boys bunny-boys leovorno');
      process.exit(1);
    }

    console.log(`\nDeleting: ${targets.join(', ')}\n`);

    for (const slug of targets) {
      const brand = await prisma.brand.findUnique({ where: { slug } });
      if (!brand) {
        console.log(`  skip (not found): ${slug}`);
        continue;
      }

      const locations = await prisma.location.findMany({
        where: { brandId: brand.id },
        select: { id: true },
      });
      const locationIds = locations.map((l) => l.id);

      if (locationIds.length > 0) {
        const orders = await prisma.order.findMany({
          where: { locationId: { in: locationIds } },
          select: { id: true },
        });
        const orderIds = orders.map((o) => o.id);

        if (orderIds.length > 0) {
          await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
          await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
          console.log(`  ${slug}: removed ${orderIds.length} order(s)`);
        }
      }

      await prisma.brand.delete({ where: { id: brand.id } });
      console.log(`  ✓ deleted store: ${slug}`);
    }

    console.log('\nDone. Refresh admin → Your stores.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
