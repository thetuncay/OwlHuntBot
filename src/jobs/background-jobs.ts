/**
 * background-jobs.ts — Worker process cron / bakim isleri
 * Discord client gerektirmez (rol sync shard 0'a Redis flag ile devredilir).
 */

import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { archiveAndResetSeason } from '../systems/leaderboard';
import { addXP } from '../systems/xp';
import { cleanupExpiredListings } from '../systems/market';
import { dailyMaintenance } from '../systems/economy';
import { cleanupOldAuditLogs } from '../utils/audit';
import { trackInterval, trackTimeout } from '../utils/shutdown';
import { sweepDirtyPlayers } from '../state/player-state';

const ROLE_SYNC_FLAG = 'pending:role_sync';

export function requestRoleSync(redis: Redis): Promise<void> {
  return redis.set(ROLE_SYNC_FLAG, '1', 'EX', 3600).then(() => undefined);
}

export async function consumeRoleSyncFlag(redis: Redis): Promise<boolean> {
  const val = await redis.get(ROLE_SYNC_FLAG);
  if (!val) return false;
  await redis.del(ROLE_SYNC_FLAG);
  return true;
}

async function checkSeasonRollover(prisma: PrismaClient, redis: Redis): Promise<void> {
  try {
    const season = await prisma.season.findUnique({ where: { id: 'current' } });
    const now = new Date();

    if (!season || now >= season.endsAt) {
      const archivedId = await archiveAndResetSeason(prisma, redis);
      console.info(`[Season] Sezon tamamlandi ve arsivlendi: ${archivedId}`);

      cleanupOldAuditLogs(prisma)
        .then((count) => console.info(`[Season] ${count} eski AuditLog kaydi silindi.`))
        .catch((err) => console.error('[Season] AuditLog temizleme hatasi:', err));

      await requestRoleSync(redis);
      console.info('[Season] Rol senkronizasyonu shard 0 icin kuyruga alindi.');
    }
  } catch (err) {
    console.error('[Season] Rollover hatasi:', err);
  }
}

async function applyPassiveTrainingXP(prisma: PrismaClient): Promise<void> {
  try {
    const trainingOwls = await prisma.owl.findMany({
      where: { passiveMode: 'training', isMain: false },
      select: { id: true, ownerId: true },
    });
    if (trainingOwls.length === 0) return;

    await Promise.allSettled(
      trainingOwls.map((owl) => addXP(prisma, owl.ownerId, 5, 'passiveTraining')),
    );
    console.info(`[Passive] ${trainingOwls.length} training baykusu icin XP verildi.`);
  } catch (err) {
    console.error('[Passive] Training XP hatasi:', err);
  }
}

async function cleanupOrphanBotPlayers(prisma: PrismaClient): Promise<void> {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const orphans = await prisma.player.findMany({
      where: {
        id: { startsWith: 'wild:' },
        createdAt: { lt: cutoff },
      },
      select: { id: true },
    });
    if (orphans.length === 0) return;
    const ids = orphans.map((p) => p.id);
    await Promise.all([
      prisma.pvpSession.deleteMany({
        where: { OR: [{ challengerId: { in: ids } }, { defenderId: { in: ids } }] },
      }),
      prisma.seasonArchive.deleteMany({ where: { playerId: { in: ids } } }),
      prisma.playerBuff.deleteMany({ where: { playerId: { in: ids } } }),
      prisma.encounter.deleteMany({ where: { playerId: { in: ids } } }),
      prisma.inventoryItem.deleteMany({ where: { ownerId: { in: ids } } }),
      prisma.playerRegistration.deleteMany({ where: { userId: { in: ids } } }),
    ]);
    await prisma.owl.deleteMany({ where: { ownerId: { in: ids } } });
    await prisma.player.deleteMany({ where: { id: { in: ids } } });
    console.info(`[Cleanup] ${ids.length} orphan bot oyuncu temizlendi.`);
  } catch (err) {
    console.error('[Cleanup] Orphan cleanup hatasi:', err);
  }
}

async function runDailyMaintenance(prisma: PrismaClient): Promise<void> {
  try {
    const players = await prisma.player.findMany({
      select: { id: true },
      where: { updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
    });
    if (players.length === 0) return;

    const BATCH_SIZE = 100;
    let processed = 0;
    for (let i = 0; i < players.length; i += BATCH_SIZE) {
      const batch = players.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(batch.map((p) => dailyMaintenance(prisma, p.id)));
      processed += batch.length;
    }
    console.info(`[Maintenance] ${processed} oyuncu icin gunluk bakim tamamlandi.`);
  } catch (err) {
    console.error('[Maintenance] Gunluk bakim hatasi:', err);
  }
}

async function runMarketCleanup(prisma: PrismaClient, redis: Redis): Promise<void> {
  try {
    const count = await cleanupExpiredListings(prisma, redis);
    if (count > 0) {
      console.info(`[Market] ${count} suresi dolmus ilan temizlendi.`);
    }
  } catch (err) {
    console.error('[Market] Cleanup hatasi:', err);
  }
}

async function cleanupStaleEncounters(prisma: PrismaClient): Promise<void> {
  try {
    const limboThreshold = new Date(Date.now() - 6 * 60 * 1000);
    const { count } = await prisma.encounter.updateMany({
      where: {
        status: 'open',
        createdAt: { lt: limboThreshold },
      },
      data: { status: 'closed' },
    });
    if (count > 0) {
      console.info(`[Encounter] ${count} stale encounter kapatildi.`);
    }
  } catch (err) {
    console.error('[Encounter] Limbo cleanup hatasi:', err);
  }
}

function scheduleNextMaintenance(prisma: PrismaClient): void {
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setUTCHours(24, 0, 0, 0);
  const msUntilMidnight = nextMidnight.getTime() - now.getTime();

  trackTimeout(() => {
    void runDailyMaintenance(prisma);
    trackInterval(() => { void runDailyMaintenance(prisma); }, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);

  console.info(
    `[Maintenance] Sonraki bakim: ${nextMidnight.toISOString()} (${Math.round(msUntilMidnight / 60000)} dk)`,
  );
}

/**
 * Worker bootstrap sonrasi tum periyodik isleri baslatir.
 */
export function startBackgroundJobs(prisma: PrismaClient, redis: Redis): void {
  trackInterval(() => {
    void checkSeasonRollover(prisma, redis);
    void applyPassiveTrainingXP(prisma);
  }, 60 * 60 * 1000);
  trackTimeout(() => { void checkSeasonRollover(prisma, redis); }, 5000);

  trackInterval(() => { void cleanupOrphanBotPlayers(prisma); }, 24 * 60 * 60 * 1000);
  trackTimeout(() => { void cleanupOrphanBotPlayers(prisma); }, 30_000);

  scheduleNextMaintenance(prisma);

  trackInterval(() => { void runMarketCleanup(prisma, redis); }, 10 * 60 * 1000);
  trackTimeout(() => { void runMarketCleanup(prisma, redis); }, 60_000);

  trackInterval(() => { void cleanupStaleEncounters(prisma); }, 10 * 60 * 1000);
  trackTimeout(() => { void cleanupStaleEncounters(prisma); }, 45_000);

  // Dirty Redis state -> PostgreSQL persist sweep
  trackInterval(() => { void sweepDirtyPlayers(prisma, redis); }, 60_000);
  trackTimeout(() => { void sweepDirtyPlayers(prisma, redis); }, 20_000);

  console.info('[Jobs] Arka plan zamanlayicilari baslatildi.');
}
