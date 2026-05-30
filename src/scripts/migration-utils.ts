/**
 * migration-utils.ts — MongoDB → PostgreSQL aktarım yardımcıları
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { MongoClient, ObjectId } from 'mongodb';

const DATE_FIELDS = new Set([
  'createdAt', 'updatedAt', 'lastHunt', 'lastSwitch', 'switchPenaltyUntil',
  'lastLootboxDropDate', 'lastTransferDate', 'lastMarketListingDate',
  'acceptedAt', 'finishedAt', 'expiresAt', 'resetAt', 'startedAt', 'endsAt',
]);

export interface MigrationData {
  seasons: Record<string, unknown>[];
  players: Record<string, unknown>[];
  owls: Record<string, unknown>[];
  inventoryItems: Record<string, unknown>[];
  playerRegistrations: Record<string, unknown>[];
  playerBuffs: Record<string, unknown>[];
  pvpSessions: Record<string, unknown>[];
  encounters: Record<string, unknown>[];
  seasonArchives: Record<string, unknown>[];
  marketListings: Record<string, unknown>[];
  dailyQuests: Record<string, unknown>[];
}

const COLLECTION_FILE_ALIASES: Record<keyof MigrationData, string[]> = {
  seasons: ['Season', 'seasons'],
  players: ['Player', 'players'],
  owls: ['Owl', 'owls'],
  inventoryItems: ['InventoryItem', 'inventory', 'inventoryItems'],
  playerRegistrations: ['PlayerRegistration', 'registrations', 'playerRegistrations'],
  playerBuffs: ['PlayerBuff', 'playerBuffs'],
  pvpSessions: ['PvpSession', 'pvpSessions'],
  encounters: ['Encounter', 'encounters'],
  seasonArchives: ['SeasonArchive', 'seasonArchives'],
  marketListings: ['MarketListing', 'marketListings'],
  dailyQuests: ['DailyQuest', 'dailyQuests'],
};

function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if ('$date' in obj) return new Date(String(obj.$date));
    if ('$oid' in obj) return String(obj.$oid);
  }
  return value;
}

export function normalizeDocument(doc: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(doc)) {
    if (key === '_id') continue;
    let value = normalizeValue(raw);
    if (DATE_FIELDS.has(key) && typeof value === 'string') {
      value = new Date(value);
    }
    out[key] = value;
  }
  return out;
}

/** Discord player ID'lerini korur; _id yalnizca id yoksa kullanilir. */
export function transformDocument<T extends Record<string, unknown>>(
  doc: T,
): Omit<T, '_id'> & { id: string } {
  const { _id, id: existingId, ...rest } = doc as T & { _id?: unknown; id?: unknown };
  let id: string;
  if (typeof existingId === 'string' && existingId.length > 0) {
    id = existingId;
  } else if (_id instanceof ObjectId) {
    id = _id.toHexString();
  } else if (typeof _id === 'string' && _id.length > 0) {
    id = _id;
  } else {
    id = String(existingId ?? '');
  }
  return { ...normalizeDocument(rest as Record<string, unknown>), id } as Omit<T, '_id'> & { id: string };
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

export function extractDbName(url: string): string {
  try {
    const match = url.match(/\/([^/?]+)(\?|$)/);
    return match?.[1] ?? 'baykusbot';
  } catch {
    return 'baykusbot';
  }
}

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
    throw new Error(`[Migration] '${collectionName}' okunamadi: ${message}`);
  }
}

export async function loadFromMongo(mongoUrl: string): Promise<MigrationData> {
  const dbName = extractDbName(mongoUrl);
  const mongoClient = new MongoClient(mongoUrl);
  await mongoClient.connect();
  console.info(`[Migration] MongoDB baglandi: ${mongoUrl} (db: ${dbName})`);

  try {
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

    return {
      seasons, players, owls, inventoryItems, playerRegistrations,
      playerBuffs, pvpSessions, encounters, seasonArchives, marketListings, dailyQuests,
    };
  } finally {
    await mongoClient.close();
  }
}

async function findBackupFile(dir: string, aliases: string[]): Promise<string | null> {
  const files = await readdir(dir);
  for (const alias of aliases) {
    const exact = files.find((f) => f === `${alias}.json`);
    if (exact) return join(dir, exact);
    const prefixed = files
      .filter((f) => f.startsWith(`${alias}_`) && f.endsWith('.json'))
      .sort()
      .at(-1);
    if (prefixed) return join(dir, prefixed);
  }
  return null;
}

async function readBackupFile(filePath: string): Promise<Record<string, unknown>[]> {
  const raw = await readFile(filePath, 'utf-8');
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error(`[Migration] Gecersiz yedek dosyasi (dizi bekleniyor): ${filePath}`);
  }
  return parsed as Record<string, unknown>[];
}

export async function loadFromBackupDir(dir: string): Promise<MigrationData> {
  console.info(`[Migration] JSON yedekler okunuyor: ${dir}`);
  const data = {} as MigrationData;

  for (const [key, aliases] of Object.entries(COLLECTION_FILE_ALIASES) as [keyof MigrationData, string[]][]) {
    const filePath = await findBackupFile(dir, aliases);
    if (!filePath) {
      console.warn(`[Migration] Yedek bulunamadi (${key}), bos koleksiyon kullaniliyor.`);
      data[key] = [];
      continue;
    }
    const docs = await readBackupFile(filePath);
    data[key] = docs;
    console.info(`[Migration] ${key}: ${docs.length} kayit ← ${filePath}`);
  }

  return data;
}
