import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

export function createPrismaAdapter(connectionString: string): {
  adapter: PrismaPg;
  pool: Pool;
} {
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);

  return { adapter, pool };
}
