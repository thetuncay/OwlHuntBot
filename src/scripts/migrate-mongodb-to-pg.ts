/**
 * migrate-mongodb-to-pg.ts — MongoDB → PostgreSQL Veri Aktarım Betiği
 *
 * Kullanim:
 *   node --import tsx src/scripts/migrate-mongodb-to-pg.ts
 *   node --import tsx src/scripts/migrate-mongodb-to-pg.ts --from-backup ./backups/2025-01-15
 *
 * Ortam:
 *   MONGODB_URL  — canli MongoDB (varsayilan kaynak)
 *   DATABASE_URL — PostgreSQL hedef
 *   MIGRATION_CONFIRM=yes — onay (migrate-user-data.sh otomatik set eder)
 */

import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import {
  compareRecordCounts,
  loadFromBackupDir,
  loadFromMongo,
  transformDocument,
  type MigrationData,
} from './migration-utils';

export { compareRecordCounts, transformDocument };

config({ path: resolve(process.cwd(), '.env') });

export interface MigrationResult {
  model: string;
  mongoCount: number;
  pgCount: number;
  matched: boolean;
}

export interface MigrationReport {
  results: MigrationResult[];
  success: boolean;
  completedAt: string;
  source: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyData = any;

async function importToPostgres(pgPrisma: PrismaClient, data: MigrationData): Promise<MigrationResult[]> {
  const results: MigrationResult[] = [];

  const {
    seasons, players, owls, inventoryItems, playerRegistrations,
    playerBuffs, pvpSessions, encounters, seasonArchives, marketListings, dailyQuests,
  } = data;

  console.info(
    `[Migration] Okundu: Season=${seasons.length}, Player=${players.length}, Owl=${owls.length}, ` +
    `Inventory=${inventoryItems.length}`,
  );

  console.info('[Migration] Mevcut PostgreSQL verisi temizleniyor...');
  await pgPrisma.auditLog.deleteMany({});
  await pgPrisma.dailyQuest.deleteMany({});
  await pgPrisma.marketListing.deleteMany({});
  await pgPrisma.seasonArchive.deleteMany({});
  await pgPrisma.encounter.deleteMany({});
  await pgPrisma.pvpSession.deleteMany({});
  await pgPrisma.playerBuff.deleteMany({});
  await pgPrisma.playerRegistration.deleteMany({});
  await pgPrisma.inventoryItem.deleteMany({});
  await pgPrisma.owl.deleteMany({});
  await pgPrisma.player.deleteMany({});
  await pgPrisma.season.deleteMany({});

  await pgPrisma.$transaction(async (tx) => {
    const seasonDocs = seasons.map(transformDocument);
    const seasonRes = await tx.season.createMany({ data: seasonDocs as AnyData, skipDuplicates: true });
    results.push({ model: 'Season', mongoCount: seasons.length, pgCount: seasonRes.count, matched: seasons.length === seasonRes.count });

    const playerDocs = players.map(transformDocument);
    const playerRes = await tx.player.createMany({ data: playerDocs as AnyData, skipDuplicates: true });
    results.push({ model: 'Player', mongoCount: players.length, pgCount: playerRes.count, matched: players.length === playerRes.count });

    const owlDocs = owls.map(transformDocument);
    const owlRes = await tx.owl.createMany({ data: owlDocs as AnyData, skipDuplicates: true });
    results.push({ model: 'Owl', mongoCount: owls.length, pgCount: owlRes.count, matched: owls.length === owlRes.count });

    const invDocs = inventoryItems.map(transformDocument);
    const invRes = await tx.inventoryItem.createMany({ data: invDocs as AnyData, skipDuplicates: true });
    results.push({ model: 'InventoryItem', mongoCount: inventoryItems.length, pgCount: invRes.count, matched: inventoryItems.length === invRes.count });

    const regDocs = playerRegistrations.map(transformDocument);
    const regRes = await tx.playerRegistration.createMany({ data: regDocs as AnyData, skipDuplicates: true });
    results.push({ model: 'PlayerRegistration', mongoCount: playerRegistrations.length, pgCount: regRes.count, matched: playerRegistrations.length === regRes.count });

    const buffDocs = playerBuffs.map(transformDocument);
    const buffRes = await tx.playerBuff.createMany({ data: buffDocs as AnyData, skipDuplicates: true });
    results.push({ model: 'PlayerBuff', mongoCount: playerBuffs.length, pgCount: buffRes.count, matched: playerBuffs.length === buffRes.count });

    const validPlayerIds = new Set(playerDocs.map((p) => p.id));
    const pvpDocs = pvpSessions.map(transformDocument).filter(
      (d) => validPlayerIds.has((d as AnyData).challengerId) && validPlayerIds.has((d as AnyData).defenderId),
    );
    const skippedPvp = pvpSessions.length - pvpDocs.length;
    if (skippedPvp > 0) console.warn(`[Migration] PvpSession: ${skippedPvp} kayit atlandi (gecersiz FK).`);
    const pvpRes = await tx.pvpSession.createMany({ data: pvpDocs as AnyData, skipDuplicates: true });
    results.push({
      model: 'PvpSession',
      mongoCount: pvpSessions.length,
      pgCount: pvpRes.count + skippedPvp,
      matched: pvpSessions.length === pvpRes.count + skippedPvp,
    });

    const encDocs = encounters.map(transformDocument);
    const encRes = await tx.encounter.createMany({ data: encDocs as AnyData, skipDuplicates: true });
    results.push({ model: 'Encounter', mongoCount: encounters.length, pgCount: encRes.count, matched: encounters.length === encRes.count });

    const archDocs = seasonArchives.map(transformDocument);
    const archRes = await tx.seasonArchive.createMany({ data: archDocs as AnyData, skipDuplicates: true });
    results.push({ model: 'SeasonArchive', mongoCount: seasonArchives.length, pgCount: archRes.count, matched: seasonArchives.length === archRes.count });

    const mktDocs = marketListings.map(transformDocument);
    const mktRes = await tx.marketListing.createMany({ data: mktDocs as AnyData, skipDuplicates: true });
    results.push({ model: 'MarketListing', mongoCount: marketListings.length, pgCount: mktRes.count, matched: marketListings.length === mktRes.count });

    const questDocs = dailyQuests.map(transformDocument);
    const questRes = await tx.dailyQuest.createMany({ data: questDocs as AnyData, skipDuplicates: true });
    results.push({ model: 'DailyQuest', mongoCount: dailyQuests.length, pgCount: questRes.count, matched: dailyQuests.length === questRes.count });

    for (const r of results) {
      console.info(`[Migration] ${r.model}: ${r.mongoCount} → ${r.pgCount} (${r.matched ? 'OK' : 'UYUSMAZLIK'})`);
    }
  }, { timeout: 300_000 });

  return results;
}

export async function runMigration(options?: { backupDir?: string }): Promise<MigrationReport> {
  if (process.env.MIGRATION_CONFIRM !== 'yes') {
    throw new Error(
      'Guvenlik: MIGRATION_CONFIRM=yes gerekli. scripts/migrate-user-data.sh kullanin.',
    );
  }

  const pgUrl = process.env.DATABASE_URL ?? '';
  if (!pgUrl) throw new Error('DATABASE_URL tanimli degil');

  const pgPrisma = new PrismaClient({ datasources: { db: { url: pgUrl } } });
  let source = 'mongodb';
  let data: MigrationData;

  try {
    await pgPrisma.$connect();
    console.info('[Migration] PostgreSQL baglandi.');

    if (options?.backupDir) {
      source = `backup:${options.backupDir}`;
      data = await loadFromBackupDir(options.backupDir);
    } else {
      const mongoUrl = process.env.MONGODB_URL ?? '';
      if (!mongoUrl) {
        throw new Error('MONGODB_URL tanimli degil. JSON yedek icin: --from-backup ./backups/...');
      }
      data = await loadFromMongo(mongoUrl);
    }

    const results = await importToPostgres(pgPrisma, data);
    const mismatches = results.filter((r) => !r.matched);
    const success = mismatches.length === 0;

    if (!success) {
      console.warn('[Migration] Uyusmazliklar:', mismatches.map((r) => `${r.model}: src=${r.mongoCount}, pg=${r.pgCount}`).join(', '));
    } else {
      console.info(`[Migration] Tamamlandi: ${results.length} model aktarildi.`);
    }

    return { results, success, completedAt: new Date().toISOString(), source };
  } finally {
    await pgPrisma.$disconnect();
  }
}

function parseCliArgs(): { backupDir?: string } {
  const idx = process.argv.indexOf('--from-backup');
  if (idx !== -1 && process.argv[idx + 1]) {
    return { backupDir: process.argv[idx + 1] };
  }
  return {};
}

if (
  process.argv[1]?.endsWith('migrate-mongodb-to-pg.ts') ||
  process.argv[1]?.endsWith('migrate-mongodb-to-pg.js')
) {
  runMigration(parseCliArgs())
    .then((report) => {
      console.info('[Migration] Rapor:', JSON.stringify(report, null, 2));
      process.exit(report.success ? 0 : 1);
    })
    .catch((error) => {
      console.error('[Migration] Hata:', error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
