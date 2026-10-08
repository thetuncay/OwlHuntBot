/**
 * worker.ts — Arka plan DB worker (BullMQ consumer + cron)
 * Discord baglantisi YOK — tek instance calistirilmali (PM2).
 */

import { PrismaClient } from '@prisma/client';
import { parseWorkerEnv, resolveDatabaseUrl, describeDatabaseUrl } from './env';
import { redis, assertRedisConnection } from './utils/redis';
import { initDbQueueConsumer, closeDbQueue } from './utils/db-queue';
import { startBackgroundJobs } from './jobs/background-jobs';
import { refreshMainOwnerPool } from './systems/pvp-opponent-pool';
import { registerGracefulShutdown, trackInterval } from './utils/shutdown';
import { validateLaunchConfig, WORKER_HEARTBEAT_KEY, WORKER_HEARTBEAT_TTL_SEC } from './utils/launch-config';

parseWorkerEnv();

const dbUrl = resolveDatabaseUrl('worker');
const prisma = new PrismaClient({
  datasources: { db: { url: dbUrl } },
});

async function writeWorkerHeartbeat(): Promise<void> {
  await redis.set(WORKER_HEARTBEAT_KEY, new Date().toISOString(), 'EX', WORKER_HEARTBEAT_TTL_SEC);
}

async function bootstrap(): Promise<void> {
  validateLaunchConfig();
  await assertRedisConnection();
  console.info('[Worker] Redis connected');
  await prisma.$connect();
  console.info(`[Worker] PostgreSQL connected (${describeDatabaseUrl(dbUrl)})`);

  initDbQueueConsumer(prisma);
  startBackgroundJobs(prisma, redis);
  void refreshMainOwnerPool(prisma, redis)
    .then((n) => console.info(`[DuelPool] ${n} main sahibi yuklendi`))
    .catch((err) => {
      console.error('[DuelPool] Yuklenemedi:', err instanceof Error ? err.message : err);
    });

  await writeWorkerHeartbeat();
  trackInterval(() => {
    void writeWorkerHeartbeat().catch((err) => {
      console.error('[Worker] Heartbeat yazilamadi:', err instanceof Error ? err.message : err);
    });
  }, 30_000);

  console.info('[Worker] Hazir — DB kuyrugu, cron ve heartbeat aktif.');
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
