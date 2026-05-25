/**
 * backup-mongodb.ts — MongoDB Yedekleme Betiği
 *
 * Geçiş öncesinde tüm MongoDB collection'larını JSON formatında dışa aktarır.
 * Her collection için ayrı bir dosya oluşturulur; dosya adlarına zaman damgası eklenir.
 *
 * Desteklenen collection'lar:
 *   Player, Owl, InventoryItem, PvpSession, Encounter,
 *   PlayerRegistration, SeasonArchive, Season
 *
 * Gereksinimler: 1.1, 1.2, 1.3, 1.4
 */

import { PrismaClient } from '@prisma/client';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Arayüzler
// ---------------------------------------------------------------------------

export interface BackupResult {
  collection: string;
  count: number;
  filePath: string;
  timestamp: string;
}

export interface BackupReport {
  results: BackupResult[];
  totalCollections: number;
  totalRecords: number;
  backupDir: string;
  completedAt: string;
}

// ---------------------------------------------------------------------------
// Yardımcı fonksiyonlar
// ---------------------------------------------------------------------------

/**
 * Dosya sistemi için güvenli yedekleme dosyası adı üretir.
 *
 * Format: `{collection}_{ISO_TIMESTAMP}.json`
 * ISO zaman damgasındaki `:` karakterleri `-` ile değiştirilir (dosya sistemi uyumluluğu).
 *
 * Örnek: `Player_2025-01-15T00-00-00.000Z.json`
 *
 * @param collection - Collection adı (örn. "Player")
 * @param timestamp  - Zaman damgası
 * @returns Dosya sistemi için güvenli dosya adı
 */
export function buildBackupFileName(collection: string, timestamp: Date): string {
  const isoTimestamp = isNaN(timestamp.getTime())
    ? new Date(0).toISOString().replace(/:/g, '-')
    : timestamp.toISOString().replace(/:/g, '-');
  return `${collection}_${isoTimestamp}.json`;
}

// ---------------------------------------------------------------------------
// Collection yedekleme
// ---------------------------------------------------------------------------

/**
 * Tek bir MongoDB collection'ını okur ve JSON dosyasına yazar.
 *
 * Prisma'nın `$runCommandRaw` API'si kullanılarak ham MongoDB komutu çalıştırılır.
 * Bu yaklaşım, Prisma MongoDB provider ile uyumludur ve ek bağımlılık gerektirmez.
 *
 * @param prisma     - Prisma istemcisi
 * @param dbName     - Veritabanı adı (kullanılmaz; Prisma bağlantısından alınır)
 * @param collection - Collection adı
 * @param outputDir  - Çıktı dizini
 * @param timestamp  - Yedekleme zaman damgası
 * @returns BackupResult — collection adı, kayıt sayısı, dosya yolu ve zaman damgası
 * @throws Collection okunamazsa veya dosya yazılamazsa hata fırlatır
 */
export async function backupCollection(
  prisma: PrismaClient,
  dbName: string,
  collection: string,
  outputDir: string,
  timestamp: Date,
): Promise<BackupResult> {
  // MongoDB find komutu ile tüm belgeleri oku
  // batchSize: 0 → sunucu varsayılanını kullan; limit: 0 → tüm belgeler
  const result = await (prisma.$runCommandRaw({
    find: collection,
    filter: {},
    limit: 0,
    batchSize: 10000,
  }) as Promise<{ cursor?: { firstBatch?: unknown[] } }>);

  const documents: unknown[] = result?.cursor?.firstBatch ?? [];

  const fileName = buildBackupFileName(collection, timestamp);
  const filePath = join(outputDir, fileName);

  await writeFile(filePath, JSON.stringify(documents, null, 2), 'utf-8');

  return {
    collection,
    count: documents.length,
    filePath,
    timestamp: timestamp.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Ana yedekleme fonksiyonu
// ---------------------------------------------------------------------------

/**
 * Tüm desteklenen MongoDB collection'larını sırayla yedekler.
 *
 * Yedekleme sırası:
 *   Player, Owl, InventoryItem, PvpSession, Encounter,
 *   PlayerRegistration, SeasonArchive, Season
 *
 * Herhangi bir collection okunamazsa işlem durur ve hangi collection'ın
 * başarısız olduğunu belirten bir hata mesajı döndürülür.
 *
 * @param outputDir - Yedekleme dosyalarının yazılacağı dizin
 * @returns BackupReport — tüm collection'ların yedekleme sonuçları
 * @throws Collection okunamazsa veya dizin oluşturulamazsa hata fırlatır
 */
export async function runBackup(outputDir: string): Promise<BackupReport> {
  const COLLECTIONS = [
    'Player',
    'Owl',
    'InventoryItem',
    'PvpSession',
    'Encounter',
    'PlayerRegistration',
    'SeasonArchive',
    'Season',
  ] as const;

  // Çıktı dizinini oluştur (zaten varsa hata verme)
  await mkdir(outputDir, { recursive: true });

  const prisma = new PrismaClient();
  const timestamp = new Date();
  const results: BackupResult[] = [];

  try {
    await prisma.$connect();

    // DATABASE_URL'den veritabanı adını çıkar
    const dbUrl = process.env.DATABASE_URL ?? '';
    const dbName = extractDbName(dbUrl);

    for (const collection of COLLECTIONS) {
      try {
        const result = await backupCollection(prisma, dbName, collection, outputDir, timestamp);
        results.push(result);
        console.info(
          `[Backup] ✓ ${collection}: ${result.count} kayıt → ${result.filePath}`,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        throw new Error(
          `[Backup] '${collection}' collection'ı yedeklenemedi: ${message}`,
        );
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  const completedAt = new Date().toISOString();
  const totalRecords = results.reduce((sum, r) => sum + r.count, 0);

  const report: BackupReport = {
    results,
    totalCollections: results.length,
    totalRecords,
    backupDir: outputDir,
    completedAt,
  };

  console.info(
    `[Backup] Tamamlandı: ${report.totalCollections} collection, ${report.totalRecords} toplam kayıt`,
  );

  return report;
}

// ---------------------------------------------------------------------------
// Yardımcı: Veritabanı adını URL'den çıkar
// ---------------------------------------------------------------------------

/**
 * MongoDB bağlantı URL'sinden veritabanı adını çıkarır.
 *
 * Örnek: `mongodb+srv://user:pass@cluster.mongodb.net/baykusbot?...` → `baykusbot`
 *
 * @param url - MongoDB bağlantı URL'si
 * @returns Veritabanı adı; bulunamazsa boş string
 */
export function extractDbName(url: string): string {
  try {
    // URL'deki path kısmını al: /baykusbot?params → baykusbot
    const match = url.match(/\/([^/?]+)(\?|$)/);
    return match?.[1] ?? '';
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// CLI giriş noktası
// ---------------------------------------------------------------------------

// Bu dosya doğrudan çalıştırıldığında yedeklemeyi başlat
// Örnek: tsx src/scripts/backup-mongodb.ts ./backups
if (process.argv[1]?.endsWith('backup-mongodb.ts') || process.argv[1]?.endsWith('backup-mongodb.js')) {
  const outputDir = process.argv[2] ?? join(process.cwd(), 'backups', new Date().toISOString().replace(/:/g, '-'));

  runBackup(outputDir)
    .then((report) => {
      console.info('[Backup] Rapor:', JSON.stringify(report, null, 2));
      process.exit(0);
    })
    .catch((error) => {
      console.error('[Backup] Hata:', error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
