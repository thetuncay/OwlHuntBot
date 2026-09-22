/**
 * ops-panel.ts — Site + admin panel (PM2: owlhuntbot-ops-panel)
 */
/** .env once env.ts yuklenir (redis modulunden once). */
import './env';

import { PrismaClient } from '@prisma/client';
import { redis, assertRedisConnection } from './utils/redis';
import { registerGracefulShutdown } from './utils/shutdown';
import { startOpsHttpServer } from './ops/ops-http-server';
import { logDiscordPublicKeyStatus } from './ops/discord-developer-endpoints';
import { getOpsPanelPort } from './ops/ops-config';
import { resolveDatabaseUrl } from './env';

let httpServer: ReturnType<typeof startOpsHttpServer> | null = null;
let prisma: PrismaClient | null = null;

async function bootstrap(): Promise<void> {
  await assertRedisConnection();
  prisma = new PrismaClient({
    datasources: { db: { url: resolveDatabaseUrl('bot') } },
  });
  await prisma.$connect();

  const port = getOpsPanelPort();
  httpServer = startOpsHttpServer(port, redis, () => null, {
    healthOnly: false,
    prisma,
  });
  await logDiscordPublicKeyStatus();
  console.info('[OpsPanel] PM2 process hazir — site + admin panel.');
}

registerGracefulShutdown([
  () =>
    new Promise<void>((resolveClose) => {
      if (!httpServer) {
        resolveClose();
        return;
      }
      httpServer.close(() => resolveClose());
    }),
  async () => {
    if (prisma) await prisma.$disconnect();
    await redis.quit();
  },
], 'OpsPanel');

void bootstrap().catch((err) => {
  console.error('[OpsPanel] Baslatma basarisiz:', err instanceof Error ? err.message : err);
  process.exit(1);
});
