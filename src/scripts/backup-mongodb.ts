/**
 * backup-mongodb.ts — MongoDB Yedekleme Betiği (native driver)
 *
 * Ornek:
 *   node --import tsx src/scripts/backup-mongodb.ts ./backups/manual-2026-05-30
 */

import { MongoClient } from 'mongodb';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { extractDbName } from './migration-utils';

config({ path: resolve(process.cwd(), '.env') });

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

export function buildBackupFileName(collection: string, timestamp: Date): string {
  const isoTimestamp = isNaN(timestamp.getTime())
    ? new Date(0).toISOString().replace(/:/g, '-')
    : timestamp.toISOString().replace(/:/g, '-');
  return `${collection}_${isoTimestamp}.json`;
}

const COLLECTIONS = [
  'Season', 'Player', 'Owl', 'InventoryItem', 'PlayerRegistration',
  'PlayerBuff', 'PvpSession', 'Encounter', 'SeasonArchive', 'MarketListing', 'DailyQuest',
] as const;

export async function backupCollection(
  mongoClient: MongoClient,
  dbName: string,
  collection: string,
  outputDir: string,
  timestamp: Date,
): Promise<BackupResult> {
  const documents = await mongoClient.db(dbName).collection(collection).find({}).toArray();
  const fileName = buildBackupFileName(collection, timestamp);
  const filePath = join(outputDir, fileName);
  await writeFile(filePath, JSON.stringify(documents, null, 2), 'utf-8');
  return { collection, count: documents.length, filePath, timestamp: timestamp.toISOString() };
}

export async function runBackup(outputDir: string): Promise<BackupReport> {
  const mongoUrl = process.env.MONGODB_URL ?? '';
  if (!mongoUrl) throw new Error('MONGODB_URL tanimli degil');

  await mkdir(outputDir, { recursive: true });
  const dbName = extractDbName(mongoUrl);
  const mongoClient = new MongoClient(mongoUrl);
  const timestamp = new Date();
  const results: BackupResult[] = [];

  try {
    await mongoClient.connect();
    console.info(`[Backup] MongoDB baglandi: ${dbName}`);

    for (const collection of COLLECTIONS) {
      const result = await backupCollection(mongoClient, dbName, collection, outputDir, timestamp);
      results.push(result);
      console.info(`[Backup] ${collection}: ${result.count} kayit → ${result.filePath}`);
    }
  } finally {
    await mongoClient.close();
  }

  const report: BackupReport = {
    results,
    totalCollections: results.length,
    totalRecords: results.reduce((sum, r) => sum + r.count, 0),
    backupDir: outputDir,
    completedAt: new Date().toISOString(),
  };

  console.info(`[Backup] Tamamlandi: ${report.totalRecords} toplam kayit`);
  return report;
}

if (process.argv[1]?.includes('backup-mongodb')) {
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
