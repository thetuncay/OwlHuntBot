/**
 * test-hunt-perf.mjs — Hunt round-trip sayısını ölçen test
 *
 * Bu script Redis MONITOR modunu kullanarak bir hunt sırasında
 * kaç DB sorgusu yapıldığını sayar.
 *
 * Kullanım:
 *   1. Bu scripti çalıştır: node test-hunt-perf.mjs
 *   2. Discord'da /hunt komutunu çalıştır
 *   3. Scripti Ctrl+C ile durdur — özet gösterilir
 *
 * Beklenen sonuç (cache hit, buff yok, level-up yok):
 *   - player sorgusu: 1 (birleşik yazma)
 *   - upsert/findUnique: 0
 */

import Redis from 'ioredis';
import { config } from 'dotenv';

config();

const monitor = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

console.log('Redis MONITOR başlatıldı. Discord\'da /hunt çalıştır...');
console.log('Durdurmak için Ctrl+C\n');

let commandCount = 0;
const commandLog = [];

// Redis MONITOR komutu — tüm komutları dinler
await monitor.monitor((err, monitorStream) => {
  if (err) {
    console.error('Monitor hatası:', err);
    process.exit(1);
  }

  monitorStream.on('monitor', (time, args) => {
    const cmd = args[0]?.toUpperCase();
    // Sadece ilgili komutları logla
    if (['GET', 'SET', 'DEL', 'LPUSH', 'RPUSH', 'ZADD'].includes(cmd)) {
      commandCount++;
      const key = args[1] ?? '';
      commandLog.push({ time: new Date(parseFloat(time) * 1000).toISOString(), cmd, key });
      console.log(`[${cmd}] ${key}`);
    }
  });
});

process.on('SIGINT', () => {
  console.log('\n=== ÖZET ===');
  console.log(`Toplam Redis komutu: ${commandCount}`);

  const cacheGets = commandLog.filter(c => c.cmd === 'GET' && c.key.startsWith('pcache:')).length;
  const cacheSets = commandLog.filter(c => c.cmd === 'SET' && c.key.startsWith('pcache:')).length;
  const cacheDels = commandLog.filter(c => c.cmd === 'DEL' && c.key.startsWith('pcache:')).length;
  const queuePush = commandLog.filter(c => ['LPUSH', 'RPUSH'].includes(c.cmd) && c.key.includes('db-writes')).length;

  console.log(`Cache GET (player okuma): ${cacheGets}`);
  console.log(`Cache SET (player yazma): ${cacheSets}`);
  console.log(`Cache DEL (invalidate):   ${cacheDels}`);
  console.log(`Queue job ekleme:         ${queuePush}`);

  if (cacheGets === 1 && cacheDels === 1) {
    console.log('\n✅ Beklenen davranış: 1 cache okuma + 1 invalidate');
  } else {
    console.log('\n⚠️  Beklenmedik pattern — logları incele');
  }

  process.exit(0);
});
