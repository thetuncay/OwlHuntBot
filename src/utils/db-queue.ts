/**
 * db-queue.ts — Asenkron DB yazma kuyruğu (BullMQ)
 *
 * NEDEN GEREKLİ:
 *   Hot-state modeli: Discord → Redis → cevap (hızlı) → Queue → DB (arka plan)
 *   Senin eski modelin: Discord → DB → DB → DB → cevap (yavaş)
 *
 *   Bu dosya "DB = sadece persist" prensibini uygular.
 *   Kullanıcı cevabı DB yazmasını BEKLEMEZ.
 *
 * KULLANIM:
 *   // Hızlı yol: kullanıcıya cevap ver
 *   await interaction.reply(result);
 *
 *   // Arka plan: DB'ye yaz (kullanıcı beklemez)
 *   enqueueDbWrite('updatePlayer', { playerId, data });
 *
 * JOB TİPLERİ:
 *   updatePlayer   — player alanlarını güncelle
 *   updateOwl      — owl alanlarını güncelle
 *   upsertInventory — envanter item'ı ekle/güncelle
 *   recordStats    — liderboard istatistiklerini güncelle
 *
 * HATA YÖNETİMİ:
 *   - Başarısız job'lar 3 kez retry edilir (exponential backoff)
 *   - Tüm retry'lar başarısız olursa job "failed" kuyruğuna düşer
 *   - Kritik hatalar console.error ile loglanır
 */

import { Queue, Worker, type Job } from 'bullmq';
import type { PrismaClient } from '@prisma/client';
import { redis } from './redis.js';
import { RUNTIME } from '../config/runtime.js';

const QUEUE_NAME = 'db-writes';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const DB_QUEUE_CONCURRENCY = Number.parseInt(process.env.DB_QUEUE_CONCURRENCY ?? '20', 10);

// Redis bağlantı ayarları — BullMQ kendi bağlantısını yönetir
const connection = {
  host: (() => {
    try {
      return new URL(REDIS_URL).hostname;
    } catch {
      return 'localhost';
    }
  })(),
  port: (() => {
    try {
      return parseInt(new URL(REDIS_URL).port || '6379', 10);
    } catch {
      return 6379;
    }
  })(),
  password: (() => {
    const fromEnv = process.env.REDIS_PASSWORD?.trim();
    if (fromEnv) return fromEnv;
    try {
      const p = new URL(REDIS_URL).password;
      return p ? decodeURIComponent(p) : undefined;
    } catch {
      return undefined;
    }
  })(),
  maxRetriesPerRequest: null, // BullMQ için gerekli
};

// ── Job veri tipleri ──────────────────────────────────────────────────────────

export interface UpdatePlayerJob {
  type: 'updatePlayer';
  playerId: string;
  data: Record<string, unknown>;
}

export interface UpdateOwlJob {
  type: 'updateOwl';
  owlId: string;
  data: Record<string, unknown>;
}

export interface UpsertInventoryJob {
  type: 'upsertInventory';
  playerId: string;
  itemName: string;
  itemType: string;
  rarity: string;
  quantity: number;
}

export interface UpsertInventoryBulkJob {
  type: 'upsertInventoryBulk';
  playerId: string;
  items: Array<{
    itemName: string;
    itemType: string;
    rarity: string;
    quantity: number;
  }>;
}

export interface RecordPreyDexJob {
  type: 'recordPreyDex';
  playerId: string;
  preyNames: string[];
}

export interface RecordStatsJob {
  type: 'recordStats';
  playerId: string;
  hunts: number;
  rareFinds: number;
  guildId?: string;
}

/** Hunt sonrasi prey dex + leaderboard + gunluk gorev — tek worker job. */
export interface RecordHuntSideEffectsJob {
  type: 'recordHuntSideEffects';
  playerId: string;
  preyNames: string[];
  hunts: number;
  rareFinds: number;
  guildId?: string;
}

export interface RecordPityJob {
  type: 'recordPity';
  playerId: string;
  lootboxId: string;
  increment: number;
  reset: boolean;
}

export interface PersistPlayerJob {
  type: 'persistPlayer';
  playerId: string;
  priority: number;
}

export interface RefreshMarketAnalyticsJob {
  type: 'refreshMarketAnalytics';
  itemId: string;
  itemName: string;
  lastSalePrice: number;
}

export interface RecordAnticheatEventJob {
  type: 'recordAnticheatEvent';
  userId: string;
  guildId: string | null;
  eventType: string;
  severity: number;
  detail: Record<string, unknown>;
}

export interface UpsertAnticheatTrustJob {
  type: 'upsertAnticheatTrust';
  userId: string;
  trustDelta: number;
  violationDelta: number;
  setLastViolationNow: boolean;
}

export type DbWriteJob =
  | UpdatePlayerJob
  | UpdateOwlJob
  | UpsertInventoryJob
  | UpsertInventoryBulkJob
  | RecordPreyDexJob
  | RecordStatsJob
  | RecordHuntSideEffectsJob
  | RecordPityJob
  | PersistPlayerJob
  | RefreshMarketAnalyticsJob
  | RecordAnticheatEventJob
  | UpsertAnticheatTrustJob;

const PERSIST_DEBOUNCE_MS = Number.parseInt(process.env.PERSIST_DEBOUNCE_MS ?? '2500', 10);
const PITY_TTL_SECONDS = Number.parseInt(process.env.PITY_TTL_SECONDS ?? String(90 * 24 * 60 * 60), 10);

// ── Queue instance ────────────────────────────────────────────────────────────

let queue: Queue | null = null;
let worker: Worker | null = null;
let prismaRef: PrismaClient | null = null;
let consumerStarted = false;

/** Producer process'te fallback yazim icin Prisma referansi enjekte et. */
export function setDbQueuePrisma(prisma: PrismaClient): void {
  prismaRef = prisma;
}

/** Bot process: sadece kuyruk ureticisi (Worker yok). */
export function initDbQueueProducer(): void {
  if (queue) return;
  queue = new Queue(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { count: 500 },
      removeOnFail: { count: 200 },
    },
  });
  console.info('[Queue] Producer baslatildi (enqueue only).');
}

/** Worker process: BullMQ consumer + ayni kuyruk. */
export function initDbQueueConsumer(prisma: PrismaClient): void {
  prismaRef = prisma;
  initDbQueueProducer();
  if (consumerStarted) return;
  consumerStarted = true;

  worker = new Worker(QUEUE_NAME, processJob, {
    connection,
    concurrency: RUNTIME.dbQueueConcurrency,
  });

  worker.on('failed', (job, err) => {
    console.error(`[Queue] Job basarisiz: ${job?.name} #${job?.id}`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[Queue] Worker hatasi:', err.message);
  });

  console.info(`[Queue] Consumer baslatildi. concurrency=${RUNTIME.dbQueueConcurrency}`);
}

/** @deprecated Worker ayirimi oncesi uyumluluk — consumer kullanin. */
export function initDbQueue(prisma: PrismaClient): void {
  initDbQueueConsumer(prisma);
}

/**
 * Queue'yu düzgünce kapatır.
 * Shutdown sırasında çağrılır.
 */
export async function closeDbQueue(): Promise<void> {
  await worker?.close();
  await queue?.close();
}

export interface QueueJobCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

/** BullMQ job counts for ops /health (producer may run without consumer). */
export async function getQueueJobCounts(): Promise<QueueJobCounts> {
  if (!queue) {
    return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0, paused: 0 };
  }
  const counts = await queue.getJobCounts(
    'waiting',
    'active',
    'completed',
    'failed',
    'delayed',
    'paused',
  );
  return {
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
    delayed: counts.delayed ?? 0,
    paused: counts.paused ?? 0,
  };
}

export interface QueueHealthSignals {
  oldestWaitingAgeSec: number | null;
  failedRecent1h: number;
  stalledHint: boolean;
}

/** Extended queue health for ops snapshot and /health. */
export async function getQueueHealth(redis: import('ioredis').Redis): Promise<QueueHealthSignals> {
  if (!queue) {
    return { oldestWaitingAgeSec: null, failedRecent1h: 0, stalledHint: false };
  }

  let oldestWaitingAgeSec: number | null = null;
  try {
    const waitingJobs = await queue.getJobs(['waiting'], 0, 0);
    const job = waitingJobs[0];
    if (job?.timestamp) {
      oldestWaitingAgeSec = Math.max(0, Math.round((Date.now() - job.timestamp) / 1000));
    }
  } catch {
    /* optional */
  }

  let failedRecent1h = 0;
  try {
    const failedJobs = await queue.getJobs(['failed'], 0, 99);
    const oneHourAgo = Date.now() - 3600_000;
    failedRecent1h = failedJobs.filter(
      (j) => j.finishedOn != null && j.finishedOn > oneHourAgo,
    ).length;
  } catch {
    /* optional */
  }

  let workerStale = true;
  try {
    const { WORKER_HEARTBEAT_KEY, WORKER_HEARTBEAT_STALE_SEC } = await import(
      './launch-config.js'
    );
    const raw = await redis.get(WORKER_HEARTBEAT_KEY);
    if (raw) {
      const ts = Date.parse(raw);
      if (Number.isFinite(ts)) {
        const ageSec = Math.round((Date.now() - ts) / 1000);
        workerStale = ageSec > WORKER_HEARTBEAT_STALE_SEC;
      }
    }
  } catch {
    /* optional */
  }

  const counts = await getQueueJobCounts();
  const stalledHint = counts.waiting > 50 && counts.active === 0 && workerStale;

  return { oldestWaitingAgeSec, failedRecent1h, stalledHint };
}

// ── Job işleyici ──────────────────────────────────────────────────────────────

async function processJob(job: Job<DbWriteJob>): Promise<void> {
  if (!prismaRef) throw new Error('Prisma başlatılmamış.');
  const data = job.data;

  switch (data.type) {
    case 'updatePlayer':
      await prismaRef.player.update({
        where: { id: data.playerId },
        data: data.data as any,
      });
      break;

    case 'updateOwl':
      await prismaRef.owl.update({
        where: { id: data.owlId },
        data: data.data as any,
      });
      break;

    case 'upsertInventory':
      await prismaRef.inventoryItem.upsert({
        where: { ownerId_itemName: { ownerId: data.playerId, itemName: data.itemName } },
        create: {
          ownerId: data.playerId,
          itemName: data.itemName,
          itemType: data.itemType,
          rarity: data.rarity,
          quantity: data.quantity,
        },
        update: { quantity: { increment: data.quantity } },
      });
      break;

    case 'upsertInventoryBulk': {
      const prisma = prismaRef;
      const aggregated = new Map<string, typeof data.items[number] & { totalQty: number }>();
      for (const item of data.items) {
        const existing = aggregated.get(item.itemName);
        if (existing) {
          existing.totalQty += item.quantity;
        } else {
          aggregated.set(item.itemName, { ...item, totalQty: item.quantity });
        }
      }
      await prisma.$transaction(
        [...aggregated.values()].map((item) =>
          prisma.inventoryItem.upsert({
            where: { ownerId_itemName: { ownerId: data.playerId, itemName: item.itemName } },
            create: {
              ownerId: data.playerId,
              itemName: item.itemName,
              itemType: item.itemType,
              rarity: item.rarity,
              quantity: item.totalQty,
            },
            update: { quantity: { increment: item.totalQty } },
          }),
        ),
      );
      break;
    }

    case 'recordPreyDex': {
      const { recordPreyCatches } = await import('../systems/prey-dex.js');
      await recordPreyCatches(prismaRef, data.playerId, data.preyNames);
      break;
    }

    case 'recordStats': {
      const { recordHuntStats } = await import('../systems/leaderboard.js');
      await recordHuntStats(
        prismaRef,
        redis,
        data.playerId,
        data.hunts,
        data.rareFinds,
        data.guildId,
      );
      break;
    }

    case 'recordHuntSideEffects': {
      const { recordPreyCatches } = await import('../systems/prey-dex.js');
      const { recordHuntStats } = await import('../systems/leaderboard.js');
      await Promise.all([
        recordPreyCatches(prismaRef, data.playerId, data.preyNames),
        recordHuntStats(
          prismaRef,
          redis,
          data.playerId,
          data.hunts,
          data.rareFinds,
          data.guildId,
        ),
      ]);
      break;
    }

    case 'recordPity': {
      const pityKey = `pity:${data.playerId}:${data.lootboxId}`;
      if (data.reset) {
        await redis.del(pityKey);
      } else {
        await redis.incrby(pityKey, data.increment);
        await redis.expire(pityKey, PITY_TTL_SECONDS);
      }
      break;
    }

    case 'persistPlayer': {
      const { persistPlayerSnapshot } = await import('../state/player-state.js');
      await persistPlayerSnapshot(prismaRef, redis, data.playerId);
      break;
    }

    case 'refreshMarketAnalytics': {
      const { refreshMarketAnalytics } = await import('../systems/market.js');
      await refreshMarketAnalytics(prismaRef, data.itemId, data.itemName, data.lastSalePrice);
      break;
    }

    case 'recordAnticheatEvent':
      await prismaRef.anticheatEvent.create({
        data: {
          userId: data.userId,
          guildId: data.guildId,
          eventType: data.eventType,
          severity: data.severity,
          detail: data.detail as any,
        },
      });
      break;

    case 'upsertAnticheatTrust': {
      const existing = await prismaRef.anticheatTrust.findUnique({
        where: { userId: data.userId },
        select: { trustScore: true, violationCount: true },
      });
      const nextTrust = Math.max(
        0,
        Math.min(100, (existing?.trustScore ?? 100) + data.trustDelta),
      );
      const nextViolationCount = Math.max(
        0,
        (existing?.violationCount ?? 0) + data.violationDelta,
      );
      await prismaRef.anticheatTrust.upsert({
        where: { userId: data.userId },
        create: {
          userId: data.userId,
          trustScore: nextTrust,
          violationCount: nextViolationCount,
          lastViolationAt: data.setLastViolationNow ? new Date() : null,
        },
        update: {
          trustScore: nextTrust,
          violationCount: nextViolationCount,
          lastViolationAt: data.setLastViolationNow ? new Date() : undefined,
        },
      });
      await redis
        .set(`trust:cache:${data.userId}`, String(nextTrust), 'EX', 300)
        .catch(() => null);
      break;
    }

    default:
      console.warn('[Queue] Bilinmeyen job tipi:', (data as any).type);
  }
}

// ── Enqueue yardımcıları ──────────────────────────────────────────────────────

/**
 * Queue başlatılmamışken gelen job'ları direkt Prisma ile yazar.
 * Veri kaybını önler — queue yoksa "sessizce at" yerine "direkt yaz".
 * WHY: Process restart sırasında gelen hunt/tame isteklerinde envanter
 * item'larının kaybolmasını engeller.
 */
async function processFallback(job: DbWriteJob): Promise<void> {
  if (!prismaRef) {
    console.error('[Queue] Fallback: Prisma da başlatılmamış, job atılıyor:', job.type);
    return;
  }
  try {
    await processJob({ data: job } as Job<DbWriteJob>);
  } catch (err) {
    console.error('[Queue] Fallback yazma hatası:', (err as Error).message, job);
  }
}

/**
 * DB yazma işini kuyruğa ekler.
 * Kullanıcı bu işlemin bitmesini BEKLEMEZ.
 * Hata olursa retry mekanizması devreye girer.
 * Queue başlatılmamışsa direkt Prisma ile yazar (veri kaybı önlenir).
 */
export function enqueueDbWrite(job: DbWriteJob): void {
  if (!queue) {
    // WHY: Queue yoksa sessizce atmak veri kaybına yol açar.
    // Fallback: direkt Prisma yazma (yavaş ama güvenli).
    console.warn('[Queue] Queue başlatılmamış, fallback ile direkt yazılıyor:', job.type);
    void processFallback(job);
    return;
  }
  // Fire-and-forget: hata olursa worker retry eder
  queue.add(job.type, job).catch((err) => {
    console.error('[Queue] Enqueue hatası:', err.message);
    // Enqueue başarısız olursa da fallback ile yaz
    void processFallback(job);
  });
}

/**
 * Birden fazla DB yazma işini tek seferde kuyruğa ekler.
 * addBulk ile tek Redis round-trip'te tüm job'lar eklenir.
 * Queue yoksa her job için fallback çalışır.
 */
export function enqueueDbWriteBulk(jobs: DbWriteJob[]): void {
  if (jobs.length === 0) return;
  if (!queue) {
    for (const job of jobs) void processFallback(job);
    return;
  }
  queue.addBulk(
    jobs.map((j) => ({ name: j.type, data: j })),
  ).catch((err) => {
    console.error('[Queue] Bulk enqueue hatasi:', err.message);
    for (const job of jobs) void processFallback(job);
  });
}

/**
 * Redis-first state persist — debounced (aynı oyuncu icin tek job).
 * Level-up sonrasi priority=1 ile daha hizli persist.
 */
export function enqueuePersistPlayer(playerId: string, priority = 0): void {
  const job: PersistPlayerJob = { type: 'persistPlayer', playerId, priority };
  if (!queue) {
    console.warn('[Queue] Producer yok, persist fallback calisiyor:', playerId);
    void processFallback(job);
    return;
  }
  queue.add(job.type, job, {
    // BullMQ custom jobId icinde ':' kullanilamaz (Redis key ayirici).
    jobId: `persist-${playerId}`,
    delay: PERSIST_DEBOUNCE_MS,
    priority: priority > 0 ? 1 : 10,
    removeOnComplete: true,
    removeOnFail: false,
  }).catch((err) => {
    console.error('[Queue] Persist enqueue hatasi:', err.message);
    void processFallback(job);
  });
}
