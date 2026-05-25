/**
 * db-queue.ts — Asenkron DB yazma kuyruğu (BullMQ)
 *
 * NEDEN GEREKLİ:
 *   OWO modeli: Discord → Redis → cevap (hızlı) → Queue → DB (arka plan)
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

const QUEUE_NAME = 'db-writes';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

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
    try {
      return new URL(REDIS_URL).password || undefined;
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

export interface RecordStatsJob {
  type: 'recordStats';
  playerId: string;
  hunts: number;
  rareFinds: number;
}

export interface RecordPityJob {
  type: 'recordPity';
  playerId: string;
  lootboxId: string;
  increment: number;  // +1 per open, or 0 to reset
  reset: boolean;     // true = set counter to 0 (on pity trigger)
}

export type DbWriteJob =
  | UpdatePlayerJob
  | UpdateOwlJob
  | UpsertInventoryJob
  | RecordStatsJob
  | RecordPityJob;

// ── Queue instance ────────────────────────────────────────────────────────────

let queue: Queue | null = null;
let worker: Worker | null = null;
let prismaRef: PrismaClient | null = null;

/**
 * Queue ve Worker'ı başlatır.
 * index.ts'de bootstrap sırasında bir kez çağrılır.
 */
export function initDbQueue(prisma: PrismaClient): void {
  prismaRef = prisma;

  queue = new Queue(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 }, // 1s, 2s, 4s
      removeOnComplete: { count: 100 },  // Son 100 başarılı job'ı tut
      removeOnFail: { count: 50 },       // Son 50 başarısız job'ı tut
    },
  });

  worker = new Worker(QUEUE_NAME, processJob, {
    connection,
    concurrency: 5,  // Aynı anda max 5 DB yazma işlemi
  });

  worker.on('failed', (job, err) => {
    console.error(`[Queue] Job başarısız: ${job?.name} #${job?.id}`, err.message);
  });

  worker.on('error', (err) => {
    console.error('[Queue] Worker hatası:', err.message);
  });

  console.info('[Queue] DB write queue başlatıldı.');
}

/**
 * Queue'yu düzgünce kapatır.
 * Shutdown sırasında çağrılır.
 */
export async function closeDbQueue(): Promise<void> {
  await worker?.close();
  await queue?.close();
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

    case 'recordStats': {
      await prismaRef.player.update({
        where: { id: data.playerId },
        data: {
          totalHunts: { increment: data.hunts },
          totalRareFinds: { increment: data.rareFinds },
        },
      });
      const { refreshPowerScore, updateLeaderboardScore } = await import('../systems/leaderboard.js');
      // Always update lb:hunt with new totalHunts
      const updatedPlayer = await prismaRef.player.findUnique({
        where: { id: data.playerId },
        select: { totalHunts: true, powerScore: true },
      });
      if (updatedPlayer) {
        await updateLeaderboardScore(redis, 'hunt', data.playerId, updatedPlayer.totalHunts);
        if (data.rareFinds > 0) {
          // refreshPowerScore updates DB and returns new score
          const newPowerScore = await refreshPowerScore(prismaRef, data.playerId);
          await updateLeaderboardScore(redis, 'power', data.playerId, newPowerScore);
        } else {
          // No rare finds, just sync current powerScore
          await updateLeaderboardScore(redis, 'power', data.playerId, updatedPlayer.powerScore);
        }
      }
      break;
    }

    case 'recordPity': {
      const pityKey = `pity:${data.playerId}:${data.lootboxId}`;
      if (data.reset) {
        await redis.del(pityKey);
      } else {
        await redis.incrby(pityKey, data.increment);
      }
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
    console.error('[Queue] Bulk enqueue hatası:', err.message);
    // Bulk enqueue başarısız olursa her job için fallback
    for (const job of jobs) void processFallback(job);
  });
}
