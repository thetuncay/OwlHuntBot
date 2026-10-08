/**
 * Production .env yüklenmeden önce bench ortamını kilitle.
 * dotenv varsayılanı override etmez; bu dosya override:true ile .env.bench yükler.
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';

const loaded = config({ path: resolve(process.cwd(), '.env.bench'), override: true });
if (loaded.error) {
  throw new Error(`.env.bench okunamadı: ${loaded.error.message}`);
}

const db = process.env.DATABASE_URL ?? '';
const redis = process.env.REDIS_URL ?? '';
if (!db.includes('5434') || !db.includes('owlhunt_bench')) {
  throw new Error('Bench DATABASE_URL 5434/owlhunt_bench değil — durduruldu.');
}
if (!redis.includes('6390')) {
  throw new Error('Bench REDIS_URL 6390 değil — durduruldu.');
}
if (db.includes(':5433') || redis.includes(':6380')) {
  throw new Error('Canlı OwlHunt portu (5433/6380) bench URL içinde — durduruldu.');
}
