/**
 * Sell rollback CLI — 1 saat / 1 gün / 1 hafta pencereleri.
 *
 * Kullanım:
 *   npx tsx scripts/rollback-sell.ts --dry-run --period=1h
 *   npx tsx scripts/rollback-sell.ts --dry-run --period=1d --date=2026-06-11
 *   npx tsx scripts/rollback-sell.ts --period=1w --date=2026-06-11
 *   npx tsx scripts/rollback-sell.ts --stats
 */
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import type { SellRollbackPeriod } from '../src/config/sell-rollback.js';
import { resolveDatabaseUrl } from '../src/env.js';
import {
  applySellRollback,
  formatRollbackPreviewText,
  getSellRollbackRetentionStats,
  previewSellRollback,
  resolveRollbackWindow,
} from '../src/systems/sell-rollback.js';

const DRY_RUN = process.argv.includes('--dry-run');
const STATS = process.argv.includes('--stats');
const periodArg = process.argv.find((a) => a.startsWith('--period='));
const dateArg = process.argv.find((a) => a.startsWith('--date='));
const untilArg = process.argv.find((a) => a.startsWith('--until='));

const PERIOD = (periodArg?.split('=')[1] ?? '1h') as SellRollbackPeriod;
const DATE = dateArg?.split('=')[1];
const UNTIL = untilArg ? new Date(untilArg.split('=')[1]!) : new Date();

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    datasources: { db: { url: resolveDatabaseUrl('bot') } },
  });
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6379');

  if (STATS) {
    const stats = await getSellRollbackRetentionStats(prisma);
    console.log('SellEvent kayıtları:', stats);
    await prisma.$disconnect();
    await redis.quit();
    return;
  }

  if (!['1h', '1d', '1w'].includes(PERIOD)) {
    console.error('Geçersiz --period. Kullan: 1h | 1d | 1w');
    process.exit(1);
  }

  const window = resolveRollbackWindow({ period: PERIOD, date: DATE, until: UNTIL });
  console.log(DRY_RUN ? '=== DRY RUN ===' : '=== ROLLBACK ===');
  console.log(window.label);

  if (DRY_RUN) {
    const preview = await previewSellRollback(prisma, redis, window);
    console.log(formatRollbackPreviewText(preview));
    console.log('\nDetay:', JSON.stringify(preview.byUser, null, 2));
  } else {
    const result = await applySellRollback(prisma, redis, window);
    console.log(formatRollbackPreviewText(result));
    if (result.applied) {
      console.log(`\nBatch: ${result.batchId}`);
    }
  }

  await prisma.$disconnect();
  await redis.quit();
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
