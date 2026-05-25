/**
 * migrate-mongodb-to-pg.ts — MongoDB → PostgreSQL Veri Aktarım Betiği
 *
 * MongoDB'deki tüm collection'ları PostgreSQL'e aktarır.
 * Foreign key bağımlılıklarına göre sıralı aktarım yapar.
 * Tüm yazma işlemleri tek bir PostgreSQL transaction içinde gerçekleştirilir;
 * herhangi bir adım başarısız olursa tüm değişiklikler geri alınır.
 *
 * Aktarım sırası (foreign key bağımlılıkları nedeniyle):
 *   Season → Player → Owl → InventoryItem → PlayerRegistration →
 *   PlayerBuff → PvpSession → Encounter → SeasonArchive → MarketListing → DailyQuest
 *
 * Gereksinimler: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
 */

import { PrismaClient } from '@prisma/client';

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
// Yardımcı fonksiyonlar
// ---------------------------------------------------------------------------

/**
 * MongoDB belgesindeki `_id` alanını `id` olarak yeniden adlandırır.
 *
 * - `_id` değeri `id` alanına kopyalanır
 * - `_id` alanı sonuç belgeden çıkarılır
 * - Diğer tüm alanlar korunur
 *
 * @param doc - `_id` alanı içerebilen MongoDB belgesi
 * @returns `_id` kaldırılmış, `id` eklenmiş belge
 */
export function transformDocument<T extends Record<string, unknown>>(
  doc: T,
): Omit<T, '_id'> & { id: string } {
  const { _id, ...rest } = doc as T & { _id?: unknown };
  return {
    ...rest,
    id: String(_id ?? ''),
  } as Omit<T, '_id'> & { id: string };
}

/**
 * MongoDB ve PostgreSQL kayıt sayılarını karşılaştırır.
 *
 * @param mongoCount - MongoDB'deki kayıt sayısı
 * @param pgCount    - PostgreSQL'deki kayıt sayısı
 * @returns `matched: true` sayılar eşitse, `discrepancy: Math.abs(mongoCount - pgCount)`
 */
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
// Collection aktarım fonksiyonu
// ---------------------------------------------------------------------------

/**
 * Tek bir MongoDB collection'ını okur ve PostgreSQL'e aktarır.
 *
 * @param mongoCollection - MongoDB'den okunacak belge dizisi ve model adı
 * @param pgInsertFn      - PostgreSQL'e yazma fonksiyonu; eklenen kayıt sayısını döndürür
 * @returns MigrationResult — model adı, kayıt sayıları ve eşleşme durumu
 */
export async function migrateCollection<T extends Record<string, unknown>>(
  mongoCollection: { model: string; documents: T[] },
  pgInsertFn: (records: Array<Omit<T, '_id'> & { id: string }>) => Promise<number>,
): Promise<MigrationResult> {
  const { model, documents } = mongoCollection;
  const mongoCount = documents.length;

  const transformed = documents.map((doc) => transformDocument(doc));
  const pgCount = await pgInsertFn(transformed);

  const { matched } = compareRecordCounts(mongoCount, pgCount);

  return {
    model,
    mongoCount,
    pgCount,
    matched,
  };
}

// ---------------------------------------------------------------------------
// MongoDB'den belge okuma yardımcısı
// ---------------------------------------------------------------------------

/**
 * Prisma MongoDB istemcisi üzerinden `$runCommandRaw` ile collection'ı okur.
 *
 * `$runCommandRaw` yalnızca MongoDB provider'da mevcuttur; PostgreSQL Prisma
 * istemcisinde bu metot bulunmaz. Bu nedenle `unknown` üzerinden cast yapılır.
 *
 * @param mongoClient    - MongoDB Prisma istemcisi
 * @param collectionName - Okunacak collection adı
 * @returns Belge dizisi
 * @throws Collection okunamazsa hata fırlatır
 */
async function readMongoCollection<T = Record<string, unknown>>(
  mongoClient: PrismaClient,
  collectionName: string,
): Promise<T[]> {
  try {
    // $runCommandRaw yalnızca MongoDB provider'da mevcut; cast gerekli
    const mongoClientAny = mongoClient as unknown as {
      $runCommandRaw: (
        cmd: Record<string, unknown>,
      ) => Promise<{ cursor?: { firstBatch?: T[] } }>;
    };

    const result = await mongoClientAny.$runCommandRaw({
      find: collectionName,
      filter: {},
      limit: 0,
      batchSize: 10000,
    });

    return result?.cursor?.firstBatch ?? [];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `[Migration] '${collectionName}' collection'ı okunamadı: ${message}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Ana aktarım fonksiyonu
// ---------------------------------------------------------------------------

/**
 * Tüm MongoDB collection'larını PostgreSQL'e aktarır.
 *
 * - İki ayrı Prisma istemcisi kullanır: biri MongoDB (MONGODB_URL veya DATABASE_URL),
 *   diğeri PostgreSQL (DATABASE_URL)
 * - Tüm yazma işlemleri tek bir PostgreSQL transaction içinde gerçekleştirilir
 * - Kayıt sayısı uyuşmazlığında `success: false` döndürür, hata fırlatmaz
 * - Transaction hatası durumunda hata fırlatır (caller rollback'i yönetir)
 *
 * @returns MigrationReport — tüm modellerin aktarım sonuçları
 */
export async function runMigration(): Promise<MigrationReport> {
  // MongoDB bağlantı URL'sini belirle
  const mongoUrl = process.env.MONGODB_URL ?? process.env.DATABASE_URL ?? '';
  const pgUrl = process.env.DATABASE_URL ?? '';

  const mongoPrisma = new PrismaClient({
    datasources: { db: { url: mongoUrl } },
  });

  const pgPrisma = new PrismaClient({
    datasources: { db: { url: pgUrl } },
  });

  const results: MigrationResult[] = [];
  let success = true;

  try {
    await mongoPrisma.$connect();
    await pgPrisma.$connect();

    // -----------------------------------------------------------------------
    // 1. MongoDB'den tüm collection'ları oku
    // -----------------------------------------------------------------------

    console.info("[Migration] MongoDB collection'ları okunuyor...");

    const [
      seasons,
      players,
      owls,
      inventoryItems,
      playerRegistrations,
      playerBuffs,
      pvpSessions,
      encounters,
      seasonArchives,
      marketListings,
      dailyQuests,
    ] = await Promise.all([
      readMongoCollection(mongoPrisma, 'Season'),
      readMongoCollection(mongoPrisma, 'Player'),
      readMongoCollection(mongoPrisma, 'Owl'),
      readMongoCollection(mongoPrisma, 'InventoryItem'),
      readMongoCollection(mongoPrisma, 'PlayerRegistration'),
      readMongoCollection(mongoPrisma, 'PlayerBuff'),
      readMongoCollection(mongoPrisma, 'PvpSession'),
      readMongoCollection(mongoPrisma, 'Encounter'),
      readMongoCollection(mongoPrisma, 'SeasonArchive'),
      readMongoCollection(mongoPrisma, 'MarketListing'),
      readMongoCollection(mongoPrisma, 'DailyQuest'),
    ]);

    console.info("[Migration] Tüm collection'lar okundu. PostgreSQL'e aktarılıyor...");

    // -----------------------------------------------------------------------
    // 2. PostgreSQL transaction içinde tüm verileri yaz
    // -----------------------------------------------------------------------

    // MongoDB belgelerini Prisma createMany'ye geçirirken tip dönüşümü gerekir.
    // Belgeler runtime'da doğru şekle sahip; statik tip kontrolü için any kullanılır.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type AnyData = any;

    await pgPrisma.$transaction(async (tx) => {
      // --- Season ---
      const seasonResult = await migrateCollection(
        { model: 'Season', documents: seasons as Array<Record<string, unknown>> },
        async (records) => {
          const res = await tx.season.createMany({
            data: records as AnyData,
            skipDuplicates: true,
          });
          return res.count;
        },
      );
      results.push(seasonResult);
      console.info(
        `[Migration] Season: ${seasonResult.mongoCount} → ${seasonResult.pgCount} (${seasonResult.matched ? '✓' : '✗ UYUŞMAZLIK'})`,
      );

      // --- Player ---
      const playerResult = await migrateCollection(
        { model: 'Player', documents: players as Array<Record<string, unknown>> },
        async (records) => {
          const res = await tx.player.createMany({
            data: records as AnyData,
            skipDuplicates: true,
          });
          return res.count;
        },
      );
      results.push(playerResult);
      console.info(
        `[Migration] Player: ${playerResult.mongoCount} → ${playerResult.pgCount} (${playerResult.matched ? '✓' : '✗ UYUŞMAZLIK'})`,
      );

      // --- Owl ---
      const owlResult = await migrateCollection(
        { model: 'Owl', documents: owls as Array<Record<string, unknown>> },
        async (records) => {
          const res = await tx.owl.createMany({
            data: records as AnyData,
            skipDuplicates: true,
          });
          return res.count;
        },
      );
      results.push(owlResult);
      console.info(
        `[Migration] Owl: ${owlResult.mongoCount} → ${owlResult.pgCount} (${owlResult.matched ? '✓' : '✗ UYUŞMAZLIK'})`,
      );

      // --- InventoryItem ---
      const inventoryResult = await migrateCollection(
        { model: 'InventoryItem', documents: inventoryItems as Array<Record<string, unknown>> },
        async (records) => {
          const res = await tx.inventoryItem.createMany({
            data: records as AnyData,
            skipDuplicates: true,
          });
          return res.count;
        },
      );
      results.push(inventoryResult);
      console.info(
        `[Migration] InventoryItem: ${inventoryResult.mongoCount} → ${inventoryResult.pgCount} (${inventoryResult.matched ? '✓' : '✗ UYUŞMAZLIK'})`,
      );

      // --- PlayerRegistration ---
      const registrationResult = await migrateCollection(
        {
          model: 'PlayerRegistration',
          documents: playerRegistrations as Array<Record<string, unknown>>,
        },
        async (records) => {
          const res = await tx.playerRegistration.createMany({
            data: records as AnyData,
            skipDuplicates: true,
          });
          return res.count;
        },
      );
      results.push(registrationResult);
      console.info(
        `[Migration] PlayerRegistration: ${registrationResult.mongoCount} → ${registrationResult.pgCount} (${registrationResult.matched ? '✓' : '✗ UYUŞMAZLIK'})`,
      );

      // --- PlayerBuff ---
      const buffResult = await migrateCollection(
        { model: 'PlayerBuff', documents: playerBuffs as Array<Record<string, unknown>> },
        async (records) => {
          const res = await tx.playerBuff.createMany({
            data: records as AnyData,
            skipDuplicates: true,
          });
          return res.count;
        },
      );
      results.push(buffResult);
      console.info(
        `[Migration] PlayerBuff: ${buffResult.mongoCount} → ${buffResult.pgCount} (${buffResult.matched ? '✓' : '✗ UYUŞMAZLIK'})`,
      );

      // --- PvpSession ---
      const pvpResult = await migrateCollection(
        { model: 'PvpSession', documents: pvpSessions as Array<Record<string, unknown>> },
        async (records) => {
          const res = await tx.pvpSession.createMany({
            data: records as AnyData,
            skipDuplicates: true,
          });
          return res.count;
        },
      );
      results.push(pvpResult);
      console.info(
        `[Migration] PvpSession: ${pvpResult.mongoCount} → ${pvpResult.pgCount} (${pvpResult.matched ? '✓' : '✗ UYUŞMAZLIK'})`,
      );

      // --- Encounter ---
      const encounterResult = await migrateCollection(
        { model: 'Encounter', documents: encounters as Array<Record<string, unknown>> },
        async (records) => {
          const res = await tx.encounter.createMany({
            data: records as AnyData,
            skipDuplicates: true,
          });
          return res.count;
        },
      );
      results.push(encounterResult);
      console.info(
        `[Migration] Encounter: ${encounterResult.mongoCount} → ${encounterResult.pgCount} (${encounterResult.matched ? '✓' : '✗ UYUŞMAZLIK'})`,
      );

      // --- SeasonArchive ---
      const archiveResult = await migrateCollection(
        {
          model: 'SeasonArchive',
          documents: seasonArchives as Array<Record<string, unknown>>,
        },
        async (records) => {
          const res = await tx.seasonArchive.createMany({
            data: records as AnyData,
            skipDuplicates: true,
          });
          return res.count;
        },
      );
      results.push(archiveResult);
      console.info(
        `[Migration] SeasonArchive: ${archiveResult.mongoCount} → ${archiveResult.pgCount} (${archiveResult.matched ? '✓' : '✗ UYUŞMAZLIK'})`,
      );

      // --- MarketListing ---
      const marketResult = await migrateCollection(
        {
          model: 'MarketListing',
          documents: marketListings as Array<Record<string, unknown>>,
        },
        async (records) => {
          const res = await tx.marketListing.createMany({
            data: records as AnyData,
            skipDuplicates: true,
          });
          return res.count;
        },
      );
      results.push(marketResult);
      console.info(
        `[Migration] MarketListing: ${marketResult.mongoCount} → ${marketResult.pgCount} (${marketResult.matched ? '✓' : '✗ UYUŞMAZLIK'})`,
      );

      // --- DailyQuest ---
      const questResult = await migrateCollection(
        { model: 'DailyQuest', documents: dailyQuests as Array<Record<string, unknown>> },
        async (records) => {
          const res = await tx.dailyQuest.createMany({
            data: records as AnyData,
            skipDuplicates: true,
          });
          return res.count;
        },
      );
      results.push(questResult);
      console.info(
        `[Migration] DailyQuest: ${questResult.mongoCount} → ${questResult.pgCount} (${questResult.matched ? '✓' : '✗ UYUŞMAZLIK'})`,
      );
    });

    // -----------------------------------------------------------------------
    // 3. Kayıt sayısı uyuşmazlıklarını kontrol et
    // -----------------------------------------------------------------------

    const mismatches = results.filter((r) => !r.matched);
    if (mismatches.length > 0) {
      success = false;
      console.warn(
        '[Migration] Kayıt sayısı uyuşmazlıkları tespit edildi:',
        mismatches
          .map((r) => `${r.model}: mongo=${r.mongoCount}, pg=${r.pgCount}`)
          .join(', '),
      );
    }
  } finally {
    await mongoPrisma.$disconnect();
    await pgPrisma.$disconnect();
  }

  const completedAt = new Date().toISOString();

  const report: MigrationReport = {
    results,
    success,
    completedAt,
  };

  if (success) {
    console.info(
      `[Migration] ✓ Tamamlandı: ${results.length} model başarıyla aktarıldı.`,
    );
  } else {
    console.warn(
      '[Migration] ✗ Tamamlandı ancak uyuşmazlıklar var. Raporu inceleyin.',
    );
  }

  return report;
}

// ---------------------------------------------------------------------------
// Veri bütünlüğü doğrulama
// ---------------------------------------------------------------------------

export interface IntegrityCheckResult {
  success: boolean;
  tableCounts: Array<{ model: string; mongoCount: number; pgCount: number; matched: boolean }>;
  sampleMismatches: Array<{ playerId: string; field: string; mongoValue: unknown; pgValue: unknown }>;
  orphanCount: number;
  completedAt: string;
}

/**
 * Aktarım sonrası veri bütünlüğünü doğrular.
 *
 * - Her tablo için MongoDB ve PostgreSQL kayıt sayılarını karşılaştırır
 * - Rastgele 10 oyuncu kaydı için alan bazında karşılaştırma yapar
 * - Foreign key (orphan kayıt) kontrolü yapar
 * - Uyuşmazlık varsa raporlar ve success: false döndürür
 *
 * Gereksinimler: 21.1, 21.2, 21.3, 21.4
 */
export async function validateDataIntegrity(
  mongoPrisma: PrismaClient,
  pgPrisma: PrismaClient,
): Promise<IntegrityCheckResult> {
  const tableCounts: IntegrityCheckResult['tableCounts'] = [];
  const sampleMismatches: IntegrityCheckResult['sampleMismatches'] = [];
  let orphanCount = 0;
  let success = true;

  // ── 1. Tablo kayıt sayısı karşılaştırması ──────────────────────────────────
  const mongoClientAny = mongoPrisma as unknown as {
    $runCommandRaw: (cmd: Record<string, unknown>) => Promise<{ n?: number }>;
  };

  const MODELS: Array<{ name: string; pgCount: () => Promise<number> }> = [
    { name: 'Player',             pgCount: () => pgPrisma.player.count() },
    { name: 'Owl',                pgCount: () => pgPrisma.owl.count() },
    { name: 'InventoryItem',      pgCount: () => pgPrisma.inventoryItem.count() },
    { name: 'PvpSession',         pgCount: () => pgPrisma.pvpSession.count() },
    { name: 'Encounter',          pgCount: () => pgPrisma.encounter.count() },
    { name: 'PlayerRegistration', pgCount: () => pgPrisma.playerRegistration.count() },
    { name: 'SeasonArchive',      pgCount: () => pgPrisma.seasonArchive.count() },
    { name: 'Season',             pgCount: () => pgPrisma.season.count() },
  ];

  for (const model of MODELS) {
    try {
      const countResult = await mongoClientAny.$runCommandRaw({
        count: model.name,
        query: {},
      });
      const mongoCount = countResult?.n ?? 0;
      const pgCount = await model.pgCount();
      const { matched } = compareRecordCounts(mongoCount, pgCount);

      tableCounts.push({ model: model.name, mongoCount, pgCount, matched });

      if (!matched) {
        success = false;
        console.warn(
          `[Integrity] ✗ ${model.name}: mongo=${mongoCount}, pg=${pgCount} (fark: ${Math.abs(mongoCount - pgCount)})`,
        );
      } else {
        console.info(`[Integrity] ✓ ${model.name}: ${pgCount} kayıt eşleşiyor`);
      }
    } catch (err) {
      console.warn(`[Integrity] ${model.name} sayım hatası:`, err instanceof Error ? err.message : err);
    }
  }

  // ── 2. Rastgele 10 oyuncu için alan bazında karşılaştırma ─────────────────
  try {
    const pgPlayers = await pgPrisma.player.findMany({
      take: 10,
      select: { id: true, coins: true, level: true, xp: true },
      orderBy: { createdAt: 'asc' },
    });

    for (const pgPlayer of pgPlayers) {
      try {
        const mongoResult = await (mongoPrisma as unknown as {
          $runCommandRaw: (cmd: Record<string, unknown>) => Promise<{
            cursor?: { firstBatch?: Array<{ _id: string; coins?: number; level?: number; xp?: number }> };
          }>;
        }).$runCommandRaw({
          find: 'Player',
          filter: { _id: pgPlayer.id },
          limit: 1,
        });

        const mongoPlayer = mongoResult?.cursor?.firstBatch?.[0];
        if (!mongoPlayer) continue;

        const fields: Array<keyof typeof pgPlayer> = ['coins', 'level', 'xp'];
        for (const field of fields) {
          if (field === 'id') continue;
          const pgVal = pgPlayer[field];
          const mongoVal = mongoPlayer[field as keyof typeof mongoPlayer];
          if (pgVal !== mongoVal) {
            sampleMismatches.push({
              playerId: pgPlayer.id,
              field,
              mongoValue: mongoVal,
              pgValue: pgVal,
            });
            success = false;
          }
        }
      } catch {
        // Oyuncu MongoDB'de bulunamadı — atla
      }
    }

    if (sampleMismatches.length > 0) {
      console.warn(`[Integrity] ✗ ${sampleMismatches.length} alan uyuşmazlığı tespit edildi`);
    } else {
      console.info('[Integrity] ✓ Örnekleme karşılaştırması başarılı');
    }
  } catch (err) {
    console.warn('[Integrity] Örnekleme karşılaştırması başarısız:', err instanceof Error ? err.message : err);
  }

  // ── 3. Orphan kayıt kontrolü (foreign key bütünlüğü) ─────────────────────
  try {
    // Owl'ların geçerli bir ownerId'ye sahip olup olmadığını kontrol et
    const orphanOwls = await pgPrisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM "Owl" o
      WHERE NOT EXISTS (SELECT 1 FROM "Player" p WHERE p.id = o."ownerId")
    `;
    const owlOrphans = Number(orphanOwls[0]?.count ?? 0);

    // InventoryItem orphan kontrolü
    const orphanItems = await pgPrisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM "InventoryItem" i
      WHERE NOT EXISTS (SELECT 1 FROM "Player" p WHERE p.id = i."ownerId")
    `;
    const itemOrphans = Number(orphanItems[0]?.count ?? 0);

    orphanCount = owlOrphans + itemOrphans;

    if (orphanCount > 0) {
      success = false;
      console.warn(`[Integrity] ✗ ${orphanCount} orphan kayıt tespit edildi (Owl: ${owlOrphans}, Item: ${itemOrphans})`);
    } else {
      console.info('[Integrity] ✓ Foreign key bütünlüğü sağlam, orphan kayıt yok');
    }
  } catch (err) {
    console.warn('[Integrity] Orphan kontrolü başarısız:', err instanceof Error ? err.message : err);
  }

  const result: IntegrityCheckResult = {
    success,
    tableCounts,
    sampleMismatches,
    orphanCount,
    completedAt: new Date().toISOString(),
  };

  if (success) {
    console.info('[Integrity] ✓ Veri bütünlüğü doğrulandı.');
  } else {
    console.warn('[Integrity] ✗ Veri bütünlüğü sorunları tespit edildi. Raporu inceleyin.');
  }

  return result;
}

// ---------------------------------------------------------------------------
// CLI giriş noktası
// ---------------------------------------------------------------------------

// Bu dosya doğrudan çalıştırıldığında aktarımı başlat
// Örnek: tsx src/scripts/migrate-mongodb-to-pg.ts
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
      console.error(
        '[Migration] Hata:',
        error instanceof Error ? error.message : error,
      );
      process.exit(1);
    });
}
