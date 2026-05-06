/**
 * shard.ts — Discord.js ShardingManager
 *
 * NEDEN GEREKLİ:
 *   1 bot process = 1 event loop = tüm komutlar sıra bekler
 *   ShardingManager = N process = N paralel event loop
 *
 *   OWO gibi botlar 10-100+ shard kullanır.
 *   Senin botun için 2-4 shard bile büyük fark yaratır.
 *
 * NASIL ÇALIŞIR:
 *   Bu dosya ana process olarak çalışır.
 *   Her shard ayrı bir Node.js process'i olarak spawn edilir.
 *   Her shard kendi Discord gateway bağlantısını yönetir.
 *   Shard'lar arası iletişim için ShardingManager.broadcastEval kullanılır.
 *
 * KULLANIM:
 *   Geliştirme: pnpm dev (index.ts direkt çalışır, shard yok)
 *   Üretim:     node dist/shard.js (ShardingManager başlatır)
 *
 * SHARD SAYISI:
 *   Discord kuralı: her shard max 2500 guild
 *   Şu an tek sunucu → 1 shard yeterli ama 2 koy (yedek + paralel)
 *   İleride büyürse SHARD_COUNT'u artır
 */

import 'dotenv/config';
import { ShardingManager } from 'discord.js';
import { join } from 'node:path';

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('[Shard] DISCORD_TOKEN eksik!');
  process.exit(1);
}

// Üretimde dist/index.js, geliştirmede src/index.ts
const scriptPath = process.env.NODE_ENV === 'production'
  ? join(process.cwd(), 'dist', 'index.js')
  : join(process.cwd(), 'src', 'index.ts');

const manager = new ShardingManager(scriptPath, {
  token,
  // 'auto' = Discord'un önerdiği shard sayısı (guild sayısına göre)
  // Küçük bot için 1 yeterli, ama 2 koy: paralel event loop kazanımı var
  totalShards: 'auto',
  respawn: true,  // Shard çökerse otomatik yeniden başlat
  execArgv: process.env.NODE_ENV !== 'production' ? ['--import', 'tsx'] : [],
});

manager.on('shardCreate', (shard) => {
  console.info(`[Shard] Shard #${shard.id} başlatıldı.`);

  shard.on('ready', () => {
    console.info(`[Shard] Shard #${shard.id} hazır.`);
  });

  shard.on('disconnect', () => {
    console.warn(`[Shard] Shard #${shard.id} bağlantısı kesildi.`);
  });

  shard.on('reconnecting', () => {
    console.info(`[Shard] Shard #${shard.id} yeniden bağlanıyor...`);
  });

  shard.on('death', (process) => {
    const code = 'exitCode' in process ? (process as unknown as { exitCode: number | null }).exitCode : null;
    console.error(`[Shard] Shard #${shard.id} öldü (exit: ${code}).`);
  });
});

manager.spawn({ timeout: 30_000 }).then(() => {
  console.info(`[Shard] Tüm shardlar başlatıldı.`);
}).catch((err) => {
  console.error('[Shard] Spawn hatası:', err);
  process.exit(1);
});

process.on('SIGTERM', async () => {
  console.info('[Shard] SIGTERM alındı, shardlar kapatılıyor...');
  await Promise.all(manager.shards.map((s) => s.kill()));
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.info('[Shard] SIGINT alındı, shardlar kapatılıyor...');
  await Promise.all(manager.shards.map((s) => s.kill()));
  process.exit(0);
});
