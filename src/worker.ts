/**
 * worker.ts — Arka plan DB worker (BullMQ consumer + cron)
 * Discord baglantisi YOK — tek instance calistirilmali (PM2).
 */

import { PrismaClient } from '@prisma/client';
import { appendPoolParams, parseWorkerEnv, resolveDatabaseUrl, describeDatabaseUrl } from './env';
import { redis, assertRedisConnection } from './utils/redis';
import { initDbQueueConsumer, closeDbQueue } from './utils/db-queue';
import { startBackgroundJobs } from './jobs/background-jobs';
import { registerGracefulShutdown } from './utils/shutdown';

const env = parseWorkerEnv();

const dbUrl = resolveDatabaseUrl('worker');
const prisma = new PrismaClient({
  datasources: { db: { url: dbUrl } },
});

async function bootstrap(): Promise<void> {
  await assertRedisConnection();
  console.info('[Worker] Redis connected');
  await prisma.$connect();
  console.info(`[Worker] PostgreSQL connected (${describeDatabaseUrl(dbUrl)})`);

  initDbQueueConsumer(prisma);
  startBackgroundJobs(prisma, redis);

  console.info('[Worker] Hazir — DB kuyrugu ve cron isleri aktif.');
}

registerGracefulShutdown([
  () => closeDbQueue(),
  async () => { await redis.quit(); },
  () => prisma.$disconnect(),
], 'Worker');

void bootstrap().catch((err) => {
  console.error('[Worker] Baslatma basarisiz:', err instanceof Error ? err.message : err);
  process.exit(1);
});
