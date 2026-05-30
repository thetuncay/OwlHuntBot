/**
 * shard.ts — Discord.js ShardingManager (Node.js / PM2 production entry)
 *
 * Geliştirme: pnpm dev (index.ts direkt, shard yok)
 * Üretim:     node --import tsx dist/shard.js  (PM2 ecosystem.config.js)
 */

import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { ShardingManager } from 'discord.js';
import { parseBotEnv } from './env';
import { registerGracefulShutdown } from './utils/shutdown';

const env = parseBotEnv();

const distEntry = join(process.cwd(), 'dist', 'index.js');
const devEntry = join(process.cwd(), 'src', 'index.ts');
const scriptPath =
  env.NODE_ENV === 'production' && existsSync(distEntry) ? distEntry : devEntry;

// Derlenmis ESM ciktisi extension'siz import kullanir — tsx hook gerekir
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

const healthServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      shards: manager.shards.size,
      script: scriptPath,
    }));
    return;
  }
  res.writeHead(404);
  res.end('Not Found');
});

healthServer.listen(env.HEALTH_PORT, () => {
  console.info(`[Shard] Health endpoint: http://localhost:${env.HEALTH_PORT}/health`);
});

async function spawnWithRetry(attempt = 1): Promise<void> {
  try {
    await manager.spawn({ timeout: 30_000 });
    console.info('[Shard] Tum shardlar baslatildi.');
  } catch (err) {
    console.error(`[Shard] Spawn hatasi (deneme ${attempt}):`, err);
    const delay = Math.min(5_000 * attempt, 30_000);
    await new Promise((resolve) => setTimeout(resolve, delay));
    await spawnWithRetry(attempt + 1);
  }
}

registerGracefulShutdown([
  () => new Promise<void>((resolve, reject) => {
    healthServer.close((err) => (err ? reject(err) : resolve()));
  }),
  async () => { await Promise.all(manager.shards.map((s) => s.kill())); },
], 'ShardManager');

void spawnWithRetry();
