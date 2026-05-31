/**
 * shard-manager.ts — Discord.js ShardingManager (Bun.js runtime — Docker icin)
 *
 * NOT: Ubuntu PM2 production ortami src/shard.ts (Node.js) kullanir.
 * Bu dosya yalnizca Dockerfile (oven/bun) ile calistirilir.
 */

import { ShardingManager } from 'discord.js';
import { join } from 'node:path';
import { isShard0 } from './utils/shard';

export { isShard0 };

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('[ShardManager] DISCORD_TOKEN eksik!');
  process.exit(1);
}

// Bun ile her zaman src/index.ts çalıştır
const scriptPath = join(import.meta.dir, 'index.ts');

const manager = new ShardingManager(scriptPath, {
  token,
  // 'auto' = Discord'un önerdiği shard sayısı (guild sayısına göre)
  totalShards: 'auto',
  respawn: true,  // Shard çökerse otomatik yeniden başlat
});

const SPAWN_RETRY_DELAY_MS = 5_000;

manager.on('shardCreate', (shard) => {
  console.info(`[ShardManager] Shard #${shard.id} oluşturuldu.`);

  shard.on('ready', () => {
    console.info(`[ShardManager] Shard #${shard.id} başarıyla başlatıldı ve hazır.`);
  });

  shard.on('disconnect', () => {
    console.warn(`[ShardManager] Shard #${shard.id} bağlantısı kesildi.`);
  });

  shard.on('reconnecting', () => {
    console.info(`[ShardManager] Shard #${shard.id} yeniden bağlanıyor...`);
  });

  shard.on('death', (process) => {
    const code = 'exitCode' in process ? (process as unknown as { exitCode: number | null }).exitCode : null;
    console.error(`[ShardManager] Shard #${shard.id} öldü (exit: ${code}).`);
  });
});

async function spawnWithRetry(): Promise<void> {
  try {
    await manager.spawn({ timeout: 30_000 });
    console.info('[ShardManager] Tüm shardlar başarıyla başlatıldı.');
  } catch (err) {
    console.error('[ShardManager] Spawn hatası:', err);
    console.info(`[ShardManager] ${SPAWN_RETRY_DELAY_MS / 1000} saniye sonra yeniden deneniyor...`);
    await new Promise((resolve) => setTimeout(resolve, SPAWN_RETRY_DELAY_MS));
    await spawnWithRetry();
  }
}

// Health endpoint — Nginx health check için (Gereksinim 12.1, 12.2)
Bun.serve({
  port: 3000,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response('Not Found', { status: 404 });
  },
});
console.info('[ShardManager] Health endpoint: http://localhost:3000/health');

void spawnWithRetry();

process.on('SIGTERM', async () => {
  console.info('[ShardManager] SIGTERM alındı, shardlar kapatılıyor...');
  await Promise.all(manager.shards.map((s) => s.kill()));
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.info('[ShardManager] SIGINT alındı, shardlar kapatılıyor...');
  await Promise.all(manager.shards.map((s) => s.kill()));
  process.exit(0);
});
