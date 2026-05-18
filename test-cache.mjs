/**
 * test-cache.mjs — Cache ve DB_Queue doğrulama scripti
 *
 * Kullanım:
 *   node test-cache.mjs <discordUserId>
 *
 * Örnek:
 *   node test-cache.mjs 1161337097261686814
 */

import Redis from 'ioredis';
import { config } from 'dotenv';

config();

const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
const playerId = process.argv[2];

if (!playerId) {
  console.error('Kullanım: node test-cache.mjs <discordUserId>');
  process.exit(1);
}

console.log('\n=== PLAYER CACHE TESTİ ===\n');

// 1. Player cache kontrolü
const cacheKey = `pcache:player:${playerId}`;
const raw = await redis.get(cacheKey);

if (raw) {
  const bundle = JSON.parse(raw);
  console.log('✅ Cache HIT — player verisi Redis\'te mevcut:');
  console.log('  id:', bundle.player.id);
  console.log('  level:', bundle.player.level);
  console.log('  xp:', bundle.player.xp);
  console.log('  coins:', bundle.player.coins);
  console.log('  huntComboStreak:', bundle.player.huntComboStreak);
  console.log('  dailyLootboxDrops:', bundle.player.dailyLootboxDrops);
  console.log('  lastLootboxDropDate:', bundle.player.lastLootboxDropDate);
  console.log('  mainOwl:', bundle.mainOwl ? `${bundle.mainOwl.species} (tier ${bundle.mainOwl.tier})` : 'yok');

  // TTL kontrolü
  const ttl = await redis.ttl(cacheKey);
  console.log(`  TTL: ${ttl}s kaldı`);
} else {
  console.log('❌ Cache MISS — Redis\'te bu oyuncu için veri yok.');
  console.log('  → /hunt komutunu çalıştır, ardından tekrar dene.');
}

// 2. BullMQ queue durumu
console.log('\n=== DB_QUEUE DURUMU ===\n');

const queueKeys = await redis.keys('bull:db-writes:*');
const waiting = queueKeys.filter(k => k.includes(':waiting')).length;
const active  = queueKeys.filter(k => k.includes(':active')).length;
const failed  = queueKeys.filter(k => k.includes(':failed')).length;

// Daha doğru sayım için list/set uzunluklarına bak
const waitingCount = await redis.llen('bull:db-writes:wait').catch(() => 0);
const activeCount  = await redis.llen('bull:db-writes:active').catch(() => 0);
const failedCount  = await redis.zcard('bull:db-writes:failed').catch(() => 0);
const completedCount = await redis.zcard('bull:db-writes:completed').catch(() => 0);

console.log('  Bekleyen job:', waitingCount);
console.log('  Aktif job:   ', activeCount);
console.log('  Başarısız:   ', failedCount, failedCount > 0 ? '⚠️' : '✅');
console.log('  Tamamlanan:  ', completedCount);

if (failedCount > 0) {
  console.log('\n  ⚠️  Başarısız job\'lar var! pm2 logs owlhuntbot ile detay bak.');
}

// 3. Buff cache kontrolü
console.log('\n=== BUFF CACHE DURUMU ===\n');
const buffKeys = await redis.keys(`*${playerId}*`);
const buffCacheKeys = buffKeys.filter(k => !k.startsWith('pcache:') && !k.startsWith('bull:'));
if (buffCacheKeys.length > 0) {
  console.log('  Buff cache anahtarları:', buffCacheKeys);
} else {
  console.log('  Buff cache: boş (in-memory, Redis\'te görünmez — bu normal)');
}

console.log('\n=== TEST TAMAMLANDI ===\n');
await redis.quit();
