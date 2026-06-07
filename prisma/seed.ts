import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required for seeding');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main(): Promise<void> {
  const adminEmail = process.env.ADMIN_SEED_EMAIL ?? 'admin@leovorno.com';
  const adminPassword = process.env.ADMIN_SEED_PASSWORD ?? 'ChangeMe!2026';
  const adminFirstName = process.env.ADMIN_SEED_FIRST_NAME ?? 'Leovorno';
  const adminLastName = process.env.ADMIN_SEED_LAST_NAME ?? 'Admin';

  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existingAdmin) {
    console.log(`Admin account already exists for ${adminEmail}. Skipping seed.`);
    return;
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await prisma.user.create({
    data: {
      email: adminEmail,
      password: passwordHash,
      firstName: adminFirstName,
      lastName: adminLastName,
      role: UserRole.ADMIN,
    },
  });

  console.log(`Seeded initial ADMIN account: ${adminEmail}`);
  console.log('Rotate ADMIN_SEED_PASSWORD immediately in production.');
}

main()
  .catch((error: unknown) => {
    console.error('Database seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
