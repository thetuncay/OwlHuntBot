import { PrismaClient } from '@prisma/client';
import { redis, assertRedisConnection } from '../utils/redis';
import { resolveDatabaseUrl } from '../env';
import { buildRetentionBaseline } from '../systems/retention/metrics-baseline';

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    datasources: { db: { url: resolveDatabaseUrl('bot') } },
  });
  try {
    await assertRedisConnection();
    await prisma.$connect();
    const report = await buildRetentionBaseline(prisma, redis);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect().catch(() => null);
    await redis.quit().catch(() => null);
  }
}

void main().catch((err) => {
  console.error('[retention-baseline] failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
