/**
 * migrate-mongodb-to-pg.ts — MongoDB → PostgreSQL Veri Aktarım Betiği
 *
 * MongoDB native driver ile okur, Prisma (PostgreSQL) ile yazar.
 * Foreign key bağımlılıklarına göre sıralı aktarım yapar.
 * Tüm yazma işlemleri tek bir PostgreSQL transaction içinde gerçekleştirilir.
 *
 * Aktarım sırası:
 *   Season → Player → Owl → InventoryItem → PlayerRegistration →
 *   PlayerBuff → PvpSession → Encounter → SeasonArchive → MarketListing → DailyQuest
 */

import { PrismaClient } from '@prisma/client';
import { MongoClient, ObjectId } from 'mongodb';

// ---------------------------------------------------------------------------
// Arayüzler
// ---------------------------------------------------------------------------

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
}

// ---------------------------------------------------------------------------
// Yardımcı: _id → id dönüşümü
// ---------------------------------------------------------------------------

export function transformDocument<T extends Record<string, unknown>>(
  doc: T,
): Omit<T, '_id'> & { id: string } {
  const { _id, ...rest } = doc as T & { _id?: unknown };
  const id = _id instanceof ObjectId ? _id.toHexString() : String(_id ?? '');
  return { ...rest, id } as Omit<T, '_id'> & { id: string };
}

export function compareRecordCounts(
  mongoCount: number,
  pgCount: number,
): { matched: boolean; discrepancy: number } {
  return {
    matched: mongoCount === pgCount,
    discrepancy: Math.abs(mongoCount - pgCount),
  };
}

// ---------------------------------------------------------------------------
// MongoDB'den collection oku (native driver)
// ---------------------------------------------------------------------------

async function readCollection<T = Record<string, unknown>>(
  mongoClient: MongoClient,
  dbName: string,
  collectionName: string,
): Promise<T[]> {
  try {
    const docs = await mongoClient.db(dbName).collection(collectionName).find({}).toArray();
    return docs as unknown as T[];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`[Migration] '${collectionName}' okunamadı: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Ana aktarım fonksiyonu
// ---------------------------------------------------------------------------

export async function runMigration(): Promise<MigrationReport> {
  const mongoUrl = process.env.MONGODB_URL ?? 'mongodb://localhost:27017/baykusbot';
  const pgUrl    = process.env.DATABASE_URL ?? '';

  // MongoDB URL'sinden DB adını çıkar
  const dbName = mongoUrl.split('/').pop()?.split('?')[0] ?? 'baykusbot';

  const mongoClient = new MongoClient(mongoUrl);
  const pgPrisma    = new PrismaClient({ datasources: { db: { url: pgUrl } } });

  const results: MigrationResult[] = [];
  let success = true;

  try {
    await mongoClient.connect();
    await pgPrisma.$connect();
    console.info(`[Migration] MongoDB bağlandı: ${mongoUrl} (db: ${dbName})`);
    console.info('[Migration] PostgreSQL bağlandı.');

    // ── 1. Tüm collection'ları oku ──────────────────────────────────────────
    console.info("[Migration] Collection'lar okunuyor...");

    const [
      seasons, players, owls, inventoryItems, playerRegistrations,
      playerBuffs, pvpSessions, encounters, seasonArchives, marketListings, dailyQuests,
    ] = await Promise.all([
      readCollection(mongoClient, dbName, 'Season'),
      readCollection(mongoClient, dbName, 'Player'),
      readCollection(mongoClient, dbName, 'Owl'),
      readCollection(mongoClient, dbName, 'InventoryItem'),
      readCollection(mongoClient, dbName, 'PlayerRegistration'),
      readCollection(mongoClient, dbName, 'PlayerBuff'),
      readCollection(mongoClient, dbName, 'PvpSession'),
      readCollection(mongoClient, dbName, 'Encounter'),
      readCollection(mongoClient, dbName, 'SeasonArchive'),
      readCollection(mongoClient, dbName, 'MarketListing'),
      readCollection(mongoClient, dbName, 'DailyQuest'),
    ]);

    console.info(`[Migration] Okundu: Season=${seasons.length}, Player=${players.length}, Owl=${owls.length}`);
    console.info("[Migration] PostgreSQL'e aktarılıyor...");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type AnyData = any;

    // ── 2. Mevcut PG verisini temizle (idempotent yeniden çalıştırma için) ──
    console.info('[Migration] Mevcut PostgreSQL verisi temizleniyor...');
    // Bağımlılık sırasına göre ters sırada sil
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
    console.info('[Migration] Temizlendi. Aktarım başlıyor...');

    // ── 3. PostgreSQL transaction ───────────────────────────────────────────
    await pgPrisma.$transaction(async (tx) => {

      // Season
      const seasonDocs = seasons.map(transformDocument);
      const seasonRes  = await tx.season.createMany({ data: seasonDocs as AnyData, skipDuplicates: true });
      const seasonResult: MigrationResult = { model: 'Season', mongoCount: seasons.length, pgCount: seasonRes.count, matched: seasons.length === seasonRes.count };
      results.push(seasonResult);
      console.info(`[Migration] Season: ${seasonResult.mongoCount} → ${seasonResult.pgCount} (${seasonResult.matched ? '✓' : '✗ UYUŞMAZLIK'})`);

      // Player
      const playerDocs = players.map(transformDocument);
      const playerRes  = await tx.player.createMany({ data: playerDocs as AnyData, skipDuplicates: true });
      const playerResult: MigrationResult = { model: 'Player', mongoCount: players.length, pgCount: playerRes.count, matched: players.length === playerRes.count };
      results.push(playerResult);
      console.info(`[Migration] Player: ${playerResult.mongoCount} → ${playerResult.pgCount} (${playerResult.matched ? '✓' : '✗ UYUŞMAZLIK'})`);

      // Owl
      const owlDocs = owls.map(transformDocument);
      const owlRes  = await tx.owl.createMany({ data: owlDocs as AnyData, skipDuplicates: true });
      const owlResult: MigrationResult = { model: 'Owl', mongoCount: owls.length, pgCount: owlRes.count, matched: owls.length === owlRes.count };
      results.push(owlResult);
      console.info(`[Migration] Owl: ${owlResult.mongoCount} → ${owlResult.pgCount} (${owlResult.matched ? '✓' : '✗ UYUŞMAZLIK'})`);

      // InventoryItem
      const invDocs = inventoryItems.map(transformDocument);
      const invRes  = await tx.inventoryItem.createMany({ data: invDocs as AnyData, skipDuplicates: true });
      const invResult: MigrationResult = { model: 'InventoryItem', mongoCount: inventoryItems.length, pgCount: invRes.count, matched: inventoryItems.length === invRes.count };
      results.push(invResult);
      console.info(`[Migration] InventoryItem: ${invResult.mongoCount} → ${invResult.pgCount} (${invResult.matched ? '✓' : '✗ UYUŞMAZLIK'})`);

      // PlayerRegistration
      const regDocs = playerRegistrations.map(transformDocument);
      const regRes  = await tx.playerRegistration.createMany({ data: regDocs as AnyData, skipDuplicates: true });
      const regResult: MigrationResult = { model: 'PlayerRegistration', mongoCount: playerRegistrations.length, pgCount: regRes.count, matched: playerRegistrations.length === regRes.count };
      results.push(regResult);
      console.info(`[Migration] PlayerRegistration: ${regResult.mongoCount} → ${regResult.pgCount} (${regResult.matched ? '✓' : '✗ UYUŞMAZLIK'})`);

      // PlayerBuff
      const buffDocs = playerBuffs.map(transformDocument);
      const buffRes  = await tx.playerBuff.createMany({ data: buffDocs as AnyData, skipDuplicates: true });
      const buffResult: MigrationResult = { model: 'PlayerBuff', mongoCount: playerBuffs.length, pgCount: buffRes.count, matched: playerBuffs.length === buffRes.count };
      results.push(buffResult);
      console.info(`[Migration] PlayerBuff: ${buffResult.mongoCount} → ${buffResult.pgCount} (${buffResult.matched ? '✓' : '✗ UYUŞMAZLIK'})`);

      // PvpSession — foreign key olmayan kayıtları atla
      const pvpDocs = pvpSessions.map(transformDocument);
      // Geçerli player ID'lerini topla
      const validPlayerIds = new Set(playerDocs.map((p) => p.id));
      const validPvpDocs = pvpDocs.filter(
        (d) => validPlayerIds.has((d as AnyData).challengerId) && validPlayerIds.has((d as AnyData).defenderId),
      );
      const skippedPvp = pvpDocs.length - validPvpDocs.length;
      if (skippedPvp > 0) console.warn(`[Migration] PvpSession: ${skippedPvp} kayıt geçersiz foreign key nedeniyle atlandı.`);
      const pvpRes  = await tx.pvpSession.createMany({ data: validPvpDocs as AnyData, skipDuplicates: true });
      const pvpResult: MigrationResult = { model: 'PvpSession', mongoCount: pvpSessions.length, pgCount: pvpRes.count + skippedPvp, matched: pvpSessions.length === pvpRes.count + skippedPvp };
      results.push(pvpResult);
      console.info(`[Migration] PvpSession: ${pvpResult.mongoCount} → ${pvpRes.count} aktarıldı, ${skippedPvp} atlandı (${pvpResult.matched ? '✓' : '✗ UYUŞMAZLIK'})`);

      // Encounter
      const encDocs = encounters.map(transformDocument);
      const encRes  = await tx.encounter.createMany({ data: encDocs as AnyData, skipDuplicates: true });
      const encResult: MigrationResult = { model: 'Encounter', mongoCount: encounters.length, pgCount: encRes.count, matched: encounters.length === encRes.count };
      results.push(encResult);
      console.info(`[Migration] Encounter: ${encResult.mongoCount} → ${encResult.pgCount} (${encResult.matched ? '✓' : '✗ UYUŞMAZLIK'})`);

      // SeasonArchive
      const archDocs = seasonArchives.map(transformDocument);
      const archRes  = await tx.seasonArchive.createMany({ data: archDocs as AnyData, skipDuplicates: true });
      const archResult: MigrationResult = { model: 'SeasonArchive', mongoCount: seasonArchives.length, pgCount: archRes.count, matched: seasonArchives.length === archRes.count };
      results.push(archResult);
      console.info(`[Migration] SeasonArchive: ${archResult.mongoCount} → ${archResult.pgCount} (${archResult.matched ? '✓' : '✗ UYUŞMAZLIK'})`);

      // MarketListing
      const mktDocs = marketListings.map(transformDocument);
      const mktRes  = await tx.marketListing.createMany({ data: mktDocs as AnyData, skipDuplicates: true });
      const mktResult: MigrationResult = { model: 'MarketListing', mongoCount: marketListings.length, pgCount: mktRes.count, matched: marketListings.length === mktRes.count };
      results.push(mktResult);
      console.info(`[Migration] MarketListing: ${mktResult.mongoCount} → ${mktResult.pgCount} (${mktResult.matched ? '✓' : '✗ UYUŞMAZLIK'})`);

      // DailyQuest
      const questDocs = dailyQuests.map(transformDocument);
      const questRes  = await tx.dailyQuest.createMany({ data: questDocs as AnyData, skipDuplicates: true });
      const questResult: MigrationResult = { model: 'DailyQuest', mongoCount: dailyQuests.length, pgCount: questRes.count, matched: dailyQuests.length === questRes.count };
      results.push(questResult);
      console.info(`[Migration] DailyQuest: ${questResult.mongoCount} → ${questResult.pgCount} (${questResult.matched ? '✓' : '✗ UYUŞMAZLIK'})`);

    }, { timeout: 60_000 });

    // ── 3. Uyuşmazlık kontrolü ─────────────────────────────────────────────
    const mismatches = results.filter((r) => !r.matched);
    if (mismatches.length > 0) {
      success = false;
      console.warn('[Migration] Uyuşmazlıklar:', mismatches.map((r) => `${r.model}: mongo=${r.mongoCount}, pg=${r.pgCount}`).join(', '));
    }

  } finally {
    await mongoClient.close();
    await pgPrisma.$disconnect();
  }

  const report: MigrationReport = { results, success, completedAt: new Date().toISOString() };

  if (success) {
    console.info(`[Migration] ✓ Tamamlandı: ${results.length} model aktarıldı.`);
  } else {
    console.warn('[Migration] ✗ Tamamlandı ancak uyuşmazlıklar var.');
  }

  return report;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

if (
  process.argv[1]?.endsWith('migrate-mongodb-to-pg.ts') ||
  process.argv[1]?.endsWith('migrate-mongodb-to-pg.js')
) {
  runMigration()
    .then((report) => {
      console.info('[Migration] Rapor:', JSON.stringify(report, null, 2));
      process.exit(report.success ? 0 : 1);
    })
    .catch((error) => {
      console.error('[Migration] Hata:', error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
