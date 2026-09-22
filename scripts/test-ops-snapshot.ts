import { config } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { resolveDatabaseUrl } from '../src/env.js';
import { persistOpsSnapshot } from '../src/ops/ops-snapshot.js';

config({ path: resolve(process.cwd(), '.env') });

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    datasources: { db: { url: resolveDatabaseUrl('worker') } },
  });
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
  try {
    const s = await persistOpsSnapshot(prisma, redis);
    console.log('snapshot ok', s.collectedAt, s.players, s.postgres);
  } finally {
    await prisma.$disconnect();
    await redis.quit();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
