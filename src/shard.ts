/**
 * shard.ts — Discord.js ShardingManager (Node.js / PM2 production entry)
 *
 * Geliştirme: pnpm dev (index.ts direkt, shard yok)
 * Üretim:     node --import tsx dist/shard.js  (PM2 ecosystem.config.js)
 */

import type { Server } from 'node:http';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ShardingManager } from 'discord.js';
import { parseBotEnv } from './env';
import { registerGracefulShutdown } from './utils/shutdown';
import { redis, assertRedisConnection } from './utils/redis';
import { initDbQueueProducer } from './utils/db-queue';
import { startOpsHttpServer } from './ops/ops-http-server';
import { validateLaunchConfig } from './utils/launch-config';

const env = parseBotEnv();

/** Fatal misconfiguration — retrying spawn will not help. */
function isFatalLaunchError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('ADMIN_USER_IDS is required') ||
    msg.includes('DISCORD_TOKEN') ||
    msg.includes('Invalid environment') ||
    msg.includes('ZodError')
  );
}

const distEntry = join(process.cwd(), 'dist', 'index.js');
const devEntry = join(process.cwd(), 'src', 'index.ts');
const scriptPath =
  env.NODE_ENV === 'production' && existsSync(distEntry) ? distEntry : devEntry;

const shardExecArgv = ['--import', 'tsx'];

const manager = new ShardingManager(scriptPath, {
  token: env.DISCORD_TOKEN,
  totalShards: 'auto',
  respawn: true,
  execArgv: shardExecArgv,
});

manager.on('shardCreate', (shard) => {
  console.info(`[Shard] Shard #${shard.id} baslatildi.`);

  shard.on('ready', () => {
    console.info(`[Shard] Shard #${shard.id} hazir.`);
  });

  shard.on('disconnect', () => {
    console.warn(`[Shard] Shard #${shard.id} baglantisi kesildi.`);
  });

  shard.on('reconnecting', () => {
    console.info(`[Shard] Shard #${shard.id} yeniden baglaniyor...`);
  });

  shard.on('death', (proc) => {
    const code = 'exitCode' in proc ? (proc as { exitCode: number | null }).exitCode : null;
    console.error(`[Shard] Shard #${shard.id} oldu (exit: ${code}).`);
  });
});

let healthServer: Server | null = null;

function startHealthServer(port: number): void {
  healthServer = startOpsHttpServer(port, redis, () => manager, { healthOnly: true });
}

async function bootstrapManager(): Promise<void> {
  validateLaunchConfig();
  await assertRedisConnection();
  initDbQueueProducer();
  startHealthServer(env.HEALTH_PORT);
  await spawnWithRetry();
}

const SPAWN_MAX_ATTEMPTS = 5;

async function spawnWithRetry(attempt = 1): Promise<void> {
  try {
    await manager.spawn({ timeout: 30_000 });
    console.info('[Shard] Tum shardlar baslatildi.');
  } catch (err) {
    console.error(`[Shard] Spawn hatasi (deneme ${attempt}/${SPAWN_MAX_ATTEMPTS}):`, err);
    if (isFatalLaunchError(err) || attempt >= SPAWN_MAX_ATTEMPTS) {
      console.error(
        '[Shard] Spawn durduruldu. Kontrol: .env icinde ADMIN_USER_IDS, DISCORD_TOKEN, DATABASE_URL.',
      );
      process.exit(1);
    }
    const delay = Math.min(5_000 * attempt, 30_000);
    await new Promise((resolve) => setTimeout(resolve, delay));
    await spawnWithRetry(attempt + 1);
  }
}

process.on('unhandledRejection', (reason) => {
  console.error('[ShardManager] unhandledRejection:', reason);
  if (isFatalLaunchError(reason)) {
    process.exit(1);
  }
});

registerGracefulShutdown([
  () => new Promise<void>((resolve) => {
    if (!healthServer) {
      resolve();
      return;
    }
    healthServer.close(() => resolve());
  }),
  async () => {
    try {
      await manager.broadcastEval((client) => {
        const c = client as import('discord.js').Client;
        return c.destroy();
      });
    } catch (err) {
      console.warn('[ShardManager] Shard destroy broadcast:', err instanceof Error ? err.message : err);
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
    await Promise.all(manager.shards.map((s) => s.kill()));
  },
], 'ShardManager');

void bootstrapManager().catch((err) => {
  console.error('[Shard] Baslatma basarisiz:', err instanceof Error ? err.message : err);
  process.exit(1);
});
