/**
 * Duplicate hunt level-up bug rollback.
 * Audit log'da ayni (oldLevel->newLevel) gecisi birden fazla olan hunt'lari tespit eder;
 * ilk gecis haric her biri icin getLevelUpReward(newLevel) kadar geri alir.
 *
 * Kullanim: npx tsx scripts/rollback-duplicate-levelups.ts [--dry-run]
 */

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { BUFF_ITEMS, getLevelUpReward, type LevelUpReward } from '../src/config.js';
import { invalidatePlayerState, rehydratePlayerState } from '../src/state/player-state.js';

const DRY_RUN = process.argv.includes('--dry-run');
const BUFF_NAME_TO_ID = new Map(BUFF_ITEMS.map((b) => [b.name, b.id]));

interface DuplicateEvent {
  playerId: string;
  oldLevel: number;
  newLevel: number;
  at: Date;
  coinDelta: number;
}

interface DeductionLine {
  newLevel: number;
  at: string;
  requested: {
    coins: number;
    lootbox?: { name: string; quantity: number };
    item?: string;
  };
  applied: {
    coins: number;
    lootbox?: { name: string; quantity: number };
    item?: string;
    removedBuffId?: string;
  };
  partial: boolean;
}

function findDuplicateLevelUps(
  audits: Array<{ playerId: string; createdAt: Date; before: unknown; after: unknown }>,
): DuplicateEvent[] {
  const dupes: DuplicateEvent[] = [];
  const seen = new Map<string, Map<string, { firstAt: Date }>>();

  for (const a of audits) {
    const b = a.before as { level?: number; coins?: number } | null;
    const f = a.after as { level?: number; coins?: number } | null;
    if (!b || !f || typeof b.level !== 'number' || typeof f.level !== 'number') continue;
    if (f.level <= b.level) continue;

    const transition = `${b.level}->${f.level}`;
    if (!seen.has(a.playerId)) seen.set(a.playerId, new Map());
    const playerMap = seen.get(a.playerId)!;

    if (playerMap.has(transition)) {
      dupes.push({
        playerId: a.playerId,
        oldLevel: b.level,
        newLevel: f.level,
        at: a.createdAt,
        coinDelta: typeof b.coins === 'number' && typeof f.coins === 'number' ? f.coins - b.coins : 0,
      });
    } else {
      playerMap.set(transition, { firstAt: a.createdAt });
    }
  }

  return dupes;
}

async function deductInventoryQty(
  tx: PrismaClient,
  playerId: string,
  itemName: string,
  quantity: number,
): Promise<number> {
  if (quantity <= 0) return 0;
  const row = await tx.inventoryItem.findUnique({
    where: { ownerId_itemName: { ownerId: playerId, itemName } },
  });
  if (!row || row.quantity <= 0) return 0;

  const applied = Math.min(quantity, row.quantity);
  if (row.quantity <= applied) {
    await tx.inventoryItem.delete({ where: { id: row.id } });
  } else {
    await tx.inventoryItem.update({
      where: { id: row.id },
      data: { quantity: { decrement: applied } },
    });
  }
  return applied;
}

async function deductBuffItem(
  tx: PrismaClient,
  playerId: string,
  itemName: string,
): Promise<{ applied: boolean; removedBuffId?: string }> {
  const buffId = BUFF_NAME_TO_ID.get(itemName);
  if (buffId) {
    const buff = await tx.playerBuff.findFirst({
      where: { playerId, buffItemId: buffId },
      orderBy: [{ chargeCur: 'asc' }, { createdAt: 'asc' }],
    });
    if (buff) {
      await tx.playerBuff.delete({ where: { id: buff.id } });
      return { applied: true, removedBuffId: buff.id };
    }
  }

  const invApplied = await deductInventoryQty(tx, playerId, itemName, 1);
  return { applied: invApplied > 0 };
}

async function applyRewardClawback(
  tx: PrismaClient,
  playerId: string,
  reward: LevelUpReward,
): Promise<{ coins: number; lootbox: number; item: boolean; removedBuffId?: string; partial: boolean }> {
  const player = await tx.player.findUnique({ where: { id: playerId }, select: { coins: true } });
  if (!player) throw new Error(`Oyuncu bulunamadi: ${playerId}`);

  let partial = false;
  const coinTarget = reward.coins;
  const coinApplied = Math.min(coinTarget, player.coins);
  if (coinApplied < coinTarget) partial = true;

  if (coinApplied > 0) {
    await tx.player.update({
      where: { id: playerId },
      data: { coins: { decrement: coinApplied } },
    });
  }

  let lootboxApplied = 0;
  if (reward.lootbox && reward.lootbox.quantity > 0) {
    lootboxApplied = await deductInventoryQty(tx, playerId, reward.lootbox.name, reward.lootbox.quantity);
    if (lootboxApplied < reward.lootbox.quantity) partial = true;
  }

  let itemApplied = false;
  let removedBuffId: string | undefined;
  if (reward.item && reward.item.quantity > 0) {
    for (let i = 0; i < reward.item.quantity; i++) {
      const res = await deductBuffItem(tx, playerId, reward.item.itemName);
      if (res.applied) {
        itemApplied = true;
        removedBuffId = res.removedBuffId;
      } else {
        partial = true;
        break;
      }
    }
  }

  return { coins: coinApplied, lootbox: lootboxApplied, item: itemApplied, removedBuffId, partial };
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6380');

  const audits = await prisma.auditLog.findMany({
    where: { action: 'hunt' },
    select: { playerId: true, createdAt: true, before: true, after: true },
    orderBy: [{ playerId: 'asc' }, { createdAt: 'asc' }],
  });

  let dupes = findDuplicateLevelUps(audits);

  // quaxyn icin tek 19->20 duplicate zaten geri alindi
  const quaxynId = '763430490354221086';
  const quaxynRollback = await prisma.auditLog.count({
    where: { playerId: quaxynId, action: { startsWith: 'admin_rollback_duplicate' } },
  });
  if (quaxynRollback > 0) {
    dupes = dupes.filter((d) => !(d.playerId === quaxynId && d.oldLevel === 19 && d.newLevel === 20));
  }

  if (dupes.length === 0) {
    console.log('Geri alinacak duplicate level-up bulunamadi.');
    await prisma.$disconnect();
    redis.disconnect();
    return;
  }

  const byPlayer = new Map<string, DuplicateEvent[]>();
  for (const d of dupes) {
    const list = byPlayer.get(d.playerId) ?? [];
    list.push(d);
    byPlayer.set(d.playerId, list);
  }

  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Duplicate event: ${dupes.length}, oyuncu: ${byPlayer.size}`);

  const summary: Array<Record<string, unknown>> = [];

  for (const [playerId, events] of byPlayer) {
    const reg = await prisma.playerRegistration.findFirst({
      where: { userId: playerId },
      select: { username: true },
    });
    const beforePlayer = await prisma.player.findUnique({
      where: { id: playerId },
      select: { coins: true, level: true, xp: true },
    });
    if (!beforePlayer) {
      console.warn(`Atlaniyor (oyuncu yok): ${playerId}`);
      continue;
    }

    const lines: DeductionLine[] = [];
    let totalCoins = 0;
    let anyPartial = false;

    if (DRY_RUN) {
      for (const ev of events) {
        const reward = getLevelUpReward(ev.newLevel);
        totalCoins += reward.coins;
        lines.push({
          newLevel: ev.newLevel,
          at: ev.at.toISOString(),
          requested: {
            coins: reward.coins,
            lootbox: reward.lootbox
              ? { name: reward.lootbox.name, quantity: reward.lootbox.quantity }
              : undefined,
            item: reward.item?.itemName,
          },
          applied: { coins: reward.coins, lootbox: reward.lootbox ? { name: reward.lootbox.name, quantity: reward.lootbox.quantity } : undefined, item: reward.item?.itemName },
          partial: false,
        });
      }
      summary.push({
        playerId,
        username: reg?.username ?? null,
        duplicates: events.length,
        totalCoinsRequested: totalCoins,
        before: beforePlayer,
        lines,
      });
      continue;
    }

    await prisma.$transaction(async (tx) => {
      for (const ev of events) {
        const reward = getLevelUpReward(ev.newLevel);
        const applied = await applyRewardClawback(tx as unknown as PrismaClient, playerId, reward);
        totalCoins += applied.coins;
        if (applied.partial) anyPartial = true;

        lines.push({
          newLevel: ev.newLevel,
          at: ev.at.toISOString(),
          requested: {
            coins: reward.coins,
            lootbox: reward.lootbox
              ? { name: reward.lootbox.name, quantity: reward.lootbox.quantity }
              : undefined,
            item: reward.item?.itemName,
          },
          applied: {
            coins: applied.coins,
            lootbox: reward.lootbox && applied.lootbox > 0
              ? { name: reward.lootbox.name, quantity: applied.lootbox }
              : undefined,
            item: applied.item ? reward.item?.itemName : undefined,
            removedBuffId: applied.removedBuffId,
          },
          partial: applied.partial,
        });
      }

      const afterPlayer = await tx.player.findUnique({
        where: { id: playerId },
        select: { coins: true, level: true, xp: true },
      });

      await tx.auditLog.create({
        data: {
          playerId,
          action: 'admin_rollback_duplicate_levelup_bulk',
          before: {
            coins: beforePlayer.coins,
            level: beforePlayer.level,
            xp: beforePlayer.xp,
            duplicateEvents: events.length,
          },
          after: {
            coins: afterPlayer?.coins,
            level: afterPlayer?.level,
            xp: afterPlayer?.xp,
            totalCoinsClawed: totalCoins,
            partial: anyPartial,
            lines,
          },
        },
      });
    });

    await invalidatePlayerState(redis, playerId);
    await rehydratePlayerState(redis, prisma, playerId);

    const afterPlayer = await prisma.player.findUnique({
      where: { id: playerId },
      select: { coins: true, level: true, xp: true },
    });

    summary.push({
      playerId,
      username: reg?.username ?? null,
      duplicates: events.length,
      totalCoinsClawed: totalCoins,
      partial: anyPartial,
      before: beforePlayer,
      after: afterPlayer,
      lines,
    });
  }

  console.log(JSON.stringify(summary, null, 2));
  await prisma.$disconnect();
  redis.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
