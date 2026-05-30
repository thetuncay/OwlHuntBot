/**
 * player-state.ts — Redis-first hot state (OwO modeli)
 *
 * Okuma/yazim once Redis; PostgreSQL sadece hydrate + arka plan persist.
 */

import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { finalXP, xpRequired } from '../utils/math';
import { PRESTIGE_XP_BONUS_PER_LEVEL, getLevelUpReward } from '../config';
import type { XpApplyResult, LevelUpResult } from '../types';
import type { CachedOwlData, CachedPlayerData } from '../utils/player-cache';
import { enqueueDbWrite, enqueuePersistPlayer } from '../utils/db-queue';

const HUNT_APPLY_LUA = `
local current = redis.call('GET', KEYS[1])
if not current then
  return redis.error_reply('NO_PLAYER')
end
redis.call('SET', KEYS[1], ARGV[1])
return 1
`;

const HYDRATED_PREFIX = 'state:hydrated:';
const PLAYER_PREFIX = 'state:player:';
const OWL_PREFIX = 'state:owl:';
const INV_PREFIX = 'state:inv:';
const DIRTY_PREFIX = 'state:dirty:';
const DIRTY_SET = 'state:dirty:set';

export interface InventoryDeltaItem {
  itemName: string;
  itemType: string;
  rarity: string;
  quantity: number;
}

export interface HuntStateDelta {
  gainedXP: number;
  newLevel: number;
  newXp: number;
  totalXPGain: number;
  huntComboStreak: number;
  noRareStreak: number;
  bondGain: number;
  owlId: string;
  inventoryItems: InventoryDeltaItem[];
  coinDelta?: number;
  levelUp?: LevelUpResult;
  levelUpRewards?: Array<{
    coins: number;
    item?: { itemName: string; itemType: string; rarity: string; quantity: number };
    lootbox?: { name: string; quantity: number };
    lootbox2?: { name: string; quantity: number };
  }>;
}

export interface PlayerStateBundle {
  player: CachedPlayerData;
  mainOwl: CachedOwlData | null;
}

function playerKey(id: string): string {
  return `${PLAYER_PREFIX}${id}`;
}

function owlKey(id: string): string {
  return `${OWL_PREFIX}${id}`;
}

function invKey(playerId: string): string {
  return `${INV_PREFIX}${playerId}`;
}

function hydratedKey(playerId: string): string {
  return `${HYDRATED_PREFIX}${playerId}`;
}

export async function markDirty(redis: Redis, playerId: string): Promise<void> {
  const ts = Date.now().toString();
  await redis
    .multi()
    .set(`${DIRTY_PREFIX}${playerId}`, ts)
    .sadd(DIRTY_SET, playerId)
    .exec();
}

export async function clearDirty(redis: Redis, playerId: string): Promise<void> {
  await redis.multi().del(`${DIRTY_PREFIX}${playerId}`).srem(DIRTY_SET, playerId).exec();
}

const MAIN_OWL_SELECT = {
  id: true,
  ownerId: true,
  species: true,
  tier: true,
  bond: true,
  statGaga: true,
  statGoz: true,
  statKulak: true,
  statKanat: true,
  statPence: true,
  quality: true,
  hp: true,
  hpMax: true,
  staminaCur: true,
  isMain: true,
  effectiveness: true,
  traits: true,
} as const;

/** mainOwlId / Redis owl key uyumsuzlugunu PG'den duzelt. */
async function ensureMainOwlInBundle(
  redis: Redis,
  prisma: PrismaClient,
  playerId: string,
  player: CachedPlayerData,
): Promise<CachedOwlData | null> {
  if (player.mainOwlId) {
    const cached = await redis.get(owlKey(player.mainOwlId));
    if (cached) return JSON.parse(cached) as CachedOwlData;
  }

  let dbOwl = player.mainOwlId
    ? await prisma.owl.findUnique({ where: { id: player.mainOwlId }, select: MAIN_OWL_SELECT })
    : null;
  if (!dbOwl || dbOwl.ownerId !== playerId) {
    dbOwl = await prisma.owl.findFirst({
      where: { ownerId: playerId, isMain: true },
      select: MAIN_OWL_SELECT,
    });
  }
  if (!dbOwl) return null;

  const owl = dbOwl as CachedOwlData;
  await redis.set(owlKey(owl.id), JSON.stringify(owl));

  if (player.mainOwlId !== owl.id) {
    player.mainOwlId = owl.id;
    await redis.set(playerKey(playerId), JSON.stringify(player));
    enqueueDbWrite({
      type: 'updatePlayer',
      playerId,
      data: { mainOwlId: owl.id },
    });
  }

  return owl;
}

/** PG'den Redis'e yukle (cache miss). */
export async function hydratePlayerState(
  redis: Redis,
  prisma: PrismaClient,
  playerId: string,
): Promise<PlayerStateBundle | null> {
  const hydrated = await redis.get(hydratedKey(playerId));
  if (hydrated === '1') {
    const rawPlayer = await redis.get(playerKey(playerId));
    if (!rawPlayer) {
      await redis.del(hydratedKey(playerId));
    } else {
      const player = JSON.parse(rawPlayer) as CachedPlayerData;
      const mainOwl = await ensureMainOwlInBundle(redis, prisma, playerId, player);
      return { player, mainOwl };
    }
  }

  const [dbPlayer, mainOwlRow] = await Promise.all([
    prisma.player.findUnique({
      where: { id: playerId },
      select: {
        id: true, level: true, xp: true, coins: true,
        huntComboStreak: true, noRareStreak: true, mainOwlId: true,
        dailyLootboxDrops: true, lastLootboxDropDate: true,
        prestigeLevel: true,
        gambleStreakWins: true, gambleStreakLosses: true,
      },
    }),
    prisma.owl.findFirst({
      where: { ownerId: playerId, isMain: true },
      select: MAIN_OWL_SELECT,
    }),
  ]);

  if (!dbPlayer) return null;

  const player: CachedPlayerData = {
    ...dbPlayer,
    lastLootboxDropDate: dbPlayer.lastLootboxDropDate?.toISOString() ?? null,
  };

  const mainOwl = mainOwlRow as CachedOwlData | null;
  if (mainOwl && player.mainOwlId !== mainOwl.id) {
    player.mainOwlId = mainOwl.id;
    if (dbPlayer.mainOwlId !== mainOwl.id) {
      enqueueDbWrite({
        type: 'updatePlayer',
        playerId,
        data: { mainOwlId: mainOwl.id },
      });
    }
  }

  const pipeline = redis.pipeline();
  pipeline.set(playerKey(playerId), JSON.stringify(player));
  pipeline.set(hydratedKey(playerId), '1');
  if (mainOwl) {
    pipeline.set(owlKey(mainOwl.id), JSON.stringify(mainOwl));
  }

  const invRows = await prisma.inventoryItem.findMany({
    where: { ownerId: playerId },
    select: { itemName: true, itemType: true, rarity: true, quantity: true },
  });
  if (invRows.length > 0) {
    const invArgs: string[] = [];
    for (const row of invRows) {
      invArgs.push(row.itemName, JSON.stringify({
        itemType: row.itemType,
        rarity: row.rarity,
        quantity: row.quantity,
      }));
    }
    pipeline.del(invKey(playerId));
    pipeline.hset(invKey(playerId), ...invArgs);
  }

  await pipeline.exec();
  return { player, mainOwl };
}

/** Saf JS XP hesabi — DB/Redis yazmaz. */
export function computeXpDelta(
  player: { level: number; xp: number; prestigeLevel?: number },
  amount: number,
): XpApplyResult {
  const prestigeBonus = 1 + (player.prestigeLevel || 0) * PRESTIGE_XP_BONUS_PER_LEVEL;
  const gainedXP = Math.round(finalXP(amount, player.level) * prestigeBonus);
  let currentLevel = player.level;
  let remainingXP = player.xp + gainedXP;
  const oldLevel = player.level;

  while (remainingXP >= xpRequired(currentLevel)) {
    remainingXP -= xpRequired(currentLevel);
    currentLevel++;
  }

  if (currentLevel <= oldLevel) {
    return { gainedXP, currentXP: remainingXP, currentLevel: oldLevel };
  }

  let rewardSummary: LevelUpResult['reward'];
  for (let lvl = oldLevel + 1; lvl <= currentLevel; lvl++) {
    const reward = getLevelUpReward(lvl);
    rewardSummary = {
      coins: reward.coins,
      lootboxName: reward.lootbox?.name,
      lootboxEmoji: reward.lootbox?.emoji,
      lootbox2Name: reward.lootbox2?.name,
      lootbox2Emoji: reward.lootbox2?.emoji,
      itemName: reward.item?.itemName,
      message: reward.message,
    };
  }

  return {
    gainedXP,
    currentXP: remainingXP,
    currentLevel,
    levelUp: {
      oldLevel,
      newLevel: currentLevel,
      remainingXP,
      reward: rewardSummary,
    },
  };
}

/** Hunt sonrasi Redis state guncelle (atomik degil ama tek oyuncu lock altinda). */
export async function applyHuntDelta(
  redis: Redis,
  prisma: PrismaClient,
  playerId: string,
  delta: HuntStateDelta,
): Promise<CachedPlayerData> {
  await loadPlayerForMutation(redis, prisma, playerId);
  const rawPlayer = await redis.get(playerKey(playerId));
  if (!rawPlayer) throw new Error('Oyuncu state bulunamadi — hydrate gerekli.');
  const player = JSON.parse(rawPlayer) as CachedPlayerData;

  player.xp = delta.newXp;
  player.level = delta.newLevel;
  player.huntComboStreak = delta.huntComboStreak;
  player.noRareStreak = delta.noRareStreak;
  if (delta.coinDelta) {
    player.coins = Math.max(0, player.coins + delta.coinDelta);
  }

  if (delta.levelUpRewards) {
    for (const reward of delta.levelUpRewards) {
      if (reward.coins > 0) player.coins += reward.coins;
    }
  }

  const pipeline = redis.pipeline();

  if (delta.bondGain > 0 && delta.owlId) {
    let rawOwl = await redis.get(owlKey(delta.owlId));
    if (!rawOwl) {
      const dbOwl = await prisma.owl.findUnique({
        where: { id: delta.owlId },
        select: {
          id: true, ownerId: true, species: true, tier: true, bond: true,
          statGaga: true, statGoz: true, statKulak: true, statKanat: true, statPence: true,
          quality: true, hp: true, hpMax: true, staminaCur: true,
          isMain: true, effectiveness: true, traits: true,
        },
      });
      if (dbOwl) {
        await redis.set(owlKey(delta.owlId), JSON.stringify(dbOwl));
        rawOwl = JSON.stringify(dbOwl);
      }
    }
    if (rawOwl) {
      const owl = JSON.parse(rawOwl) as CachedOwlData;
      owl.bond = Math.min(100, (owl.bond ?? 0) + delta.bondGain);
      pipeline.set(owlKey(delta.owlId), JSON.stringify(owl));
    }
  }

  for (const item of delta.inventoryItems) {
    const existingRaw = await redis.hget(invKey(playerId), item.itemName);
    if (existingRaw) {
      const existing = JSON.parse(existingRaw) as { itemType: string; rarity: string; quantity: number };
      existing.quantity += item.quantity;
      pipeline.hset(invKey(playerId), item.itemName, JSON.stringify(existing));
    } else {
      pipeline.hset(
        invKey(playerId),
        item.itemName,
        JSON.stringify({ itemType: item.itemType, rarity: item.rarity, quantity: item.quantity }),
      );
    }
  }

  if (delta.levelUpRewards) {
    for (const reward of delta.levelUpRewards) {
      if (reward.item) {
        const meta = reward.item;
        const existingRaw = await redis.hget(invKey(playerId), meta.itemName);
        if (existingRaw) {
          const existing = JSON.parse(existingRaw);
          existing.quantity += meta.quantity;
          pipeline.hset(invKey(playerId), meta.itemName, JSON.stringify(existing));
        } else {
          pipeline.hset(invKey(playerId), meta.itemName, JSON.stringify({
            itemType: meta.itemType,
            rarity: meta.rarity,
            quantity: meta.quantity,
          }));
        }
      }
      if (reward.lootbox) {
        const name = reward.lootbox.name;
        const existingRaw = await redis.hget(invKey(playerId), name);
        if (existingRaw) {
          const existing = JSON.parse(existingRaw);
          existing.quantity += reward.lootbox.quantity;
          pipeline.hset(invKey(playerId), name, JSON.stringify(existing));
        } else {
          pipeline.hset(invKey(playerId), name, JSON.stringify({
            itemType: 'Lootbox',
            rarity: 'Rare',
            quantity: reward.lootbox.quantity,
          }));
        }
      }
      if (reward.lootbox2) {
        const name = reward.lootbox2.name;
        const existingRaw = await redis.hget(invKey(playerId), name);
        if (existingRaw) {
          const existing = JSON.parse(existingRaw);
          existing.quantity += reward.lootbox2.quantity;
          pipeline.hset(invKey(playerId), name, JSON.stringify(existing));
        } else {
          pipeline.hset(invKey(playerId), name, JSON.stringify({
            itemType: 'Lootbox',
            rarity: 'Rare',
            quantity: reward.lootbox2.quantity,
          }));
        }
      }
    }
  }

  await pipeline.exec();
  await markDirty(redis, playerId);

  // Player JSON — Lua ile atomik SET (tek round-trip)
  await redis.eval(HUNT_APPLY_LUA, 1, playerKey(playerId), JSON.stringify(player));

  if (delta.totalXPGain > 0) {
    enqueueDbWrite({
      type: 'updatePlayer',
      playerId,
      data: { totalXP: { increment: delta.totalXPGain } },
    });
  }

  enqueuePersistPlayer(playerId, delta.levelUp ? 1 : 0);
  return player;
}

/** Redis'te yoksa PG'den hydrate et. */
async function loadPlayerForMutation(
  redis: Redis,
  prisma: PrismaClient | undefined,
  playerId: string,
): Promise<CachedPlayerData> {
  const raw = await redis.get(playerKey(playerId));
  if (raw) return JSON.parse(raw) as CachedPlayerData;
  if (!prisma) throw new Error('Oyuncu state bulunamadi.');
  const bundle = await hydratePlayerState(redis, prisma, playerId);
  if (!bundle) throw new Error('Oyuncu bulunamadi.');
  return bundle.player;
}

/** Biyom giris ucreti — Redis coin dus. */
export async function deductCoinsInRedis(
  redis: Redis,
  playerId: string,
  amount: number,
  prisma?: PrismaClient,
): Promise<number> {
  const player = await loadPlayerForMutation(redis, prisma, playerId);
  if (player.coins < amount) throw new Error('Yetersiz coin.');
  player.coins -= amount;
  await redis.set(playerKey(playerId), JSON.stringify(player));
  await markDirty(redis, playerId);
  enqueuePersistPlayer(playerId);
  return player.coins;
}

/** PvP / gambling coin mutasyonu. */
export async function applyCoinDeltaInRedis(
  redis: Redis,
  playerId: string,
  delta: number,
  prisma?: PrismaClient,
): Promise<number> {
  const player = await loadPlayerForMutation(redis, prisma, playerId);
  player.coins = Math.max(0, player.coins + delta);
  await redis.set(playerKey(playerId), JSON.stringify(player));
  await markDirty(redis, playerId);
  enqueuePersistPlayer(playerId);
  return player.coins;
}

const PCACHE_PLAYER_PREFIX = 'pcache:player:';

/** PG envanterini Redis hash'e yukle (coin dokunulmaz). */
export async function reloadInventoryFromPg(
  redis: Redis,
  prisma: PrismaClient,
  playerId: string,
): Promise<void> {
  const invRows = await prisma.inventoryItem.findMany({
    where: { ownerId: playerId },
    select: { itemName: true, itemType: true, rarity: true, quantity: true },
  });
  const key = invKey(playerId);
  const pipeline = redis.pipeline().del(key);
  if (invRows.length > 0) {
    const invArgs: string[] = [];
    for (const row of invRows) {
      invArgs.push(row.itemName, JSON.stringify({
        itemType: row.itemType,
        rarity: row.rarity,
        quantity: row.quantity,
      }));
    }
    pipeline.hset(key, ...invArgs);
  }
  await pipeline.exec();
  await markDirty(redis, playerId);
  enqueuePersistPlayer(playerId);
}

/** PG level/xp alanlarini Redis'e yansit (coin dokunulmaz). */
export async function refreshPlayerXpInRedis(
  redis: Redis,
  prisma: PrismaClient,
  playerId: string,
): Promise<void> {
  const db = await prisma.player.findUnique({
    where: { id: playerId },
    select: { level: true, xp: true },
  });
  if (!db) return;
  try {
    const player = await loadPlayerForMutation(redis, prisma, playerId);
    player.level = db.level;
    player.xp = db.xp;
    await redis.set(playerKey(playerId), JSON.stringify(player));
    await markDirty(redis, playerId);
    enqueuePersistPlayer(playerId);
  } catch {
    await invalidatePlayerState(redis, playerId);
  }
}

/** PG yazimindan sonra Redis state senkronize et. */
export async function syncPlayerStateAfterPgWrite(
  redis: Redis | undefined,
  prisma: PrismaClient,
  playerId: string,
  mode: 'coins' | 'progress' | 'inventory' | 'full' = 'coins',
): Promise<void> {
  if (!redis) return;
  switch (mode) {
    case 'full':
      await refreshPlayerCoinsInRedis(redis, prisma, playerId);
      await reloadInventoryFromPg(redis, prisma, playerId);
      break;
    case 'inventory':
      await reloadInventoryFromPg(redis, prisma, playerId);
      break;
    case 'progress':
      await refreshPlayerXpInRedis(redis, prisma, playerId);
      break;
    default:
      await refreshPlayerCoinsInRedis(redis, prisma, playerId);
  }
}

/** Tam reset sonrasi (prestige/setmain): PG'den yeniden hydrate. */
export async function rehydratePlayerState(
  redis: Redis,
  prisma: PrismaClient,
  playerId: string,
): Promise<void> {
  await invalidatePlayerState(redis, playerId);
  await hydratePlayerState(redis, prisma, playerId);
}

/** PG coin yazimindan sonra Redis coin alanini senkronize et. */
export async function refreshPlayerCoinsInRedis(
  redis: Redis,
  prisma: PrismaClient,
  playerId: string,
): Promise<void> {
  const db = await prisma.player.findUnique({
    where: { id: playerId },
    select: { coins: true },
  });
  if (!db) return;
  try {
    const player = await loadPlayerForMutation(redis, prisma, playerId);
    player.coins = db.coins;
    await redis.set(playerKey(playerId), JSON.stringify(player));
    await markDirty(redis, playerId);
    enqueuePersistPlayer(playerId);
  } catch {
    await invalidatePlayerState(redis, playerId);
  }
}

/** Redis hot state + eski pcache temizle — sonraki okuma PG'den hydrate eder. */
export async function invalidatePlayerState(redis: Redis, playerId: string): Promise<void> {
  await redis.del(
    playerKey(playerId),
    hydratedKey(playerId),
    `${PCACHE_PLAYER_PREFIX}${playerId}`,
  );
}

/** Worker: dirty oyunculari PG'ye persist et. */
export async function persistPlayerSnapshot(
  prisma: PrismaClient,
  redis: Redis,
  playerId: string,
): Promise<void> {
  const rawPlayer = await redis.get(playerKey(playerId));
  if (!rawPlayer) {
    await clearDirty(redis, playerId);
    return;
  }
  const player = JSON.parse(rawPlayer) as CachedPlayerData;

  let owlUpdate: CachedOwlData | null = null;
  if (player.mainOwlId) {
    const rawOwl = await redis.get(owlKey(player.mainOwlId));
    if (rawOwl) {
      owlUpdate = JSON.parse(rawOwl) as CachedOwlData;
    } else {
      const dbOwl = await prisma.owl.findUnique({
        where: { id: player.mainOwlId },
        select: MAIN_OWL_SELECT,
      });
      if (dbOwl) owlUpdate = dbOwl as CachedOwlData;
    }
  }
  if (!owlUpdate) {
    const dbMain = await prisma.owl.findFirst({
      where: { ownerId: playerId, isMain: true },
      select: MAIN_OWL_SELECT,
    });
    if (dbMain) owlUpdate = dbMain as CachedOwlData;
  }

  const invHash = await redis.hgetall(invKey(playerId));
  const invEntries = Object.entries(invHash);

  await prisma.$transaction(async (tx) => {
    await tx.player.update({
      where: { id: playerId },
      data: {
        level: player.level,
        xp: player.xp,
        coins: player.coins,
        huntComboStreak: player.huntComboStreak,
        noRareStreak: player.noRareStreak,
        lastHunt: new Date(),
      },
    });

    if (owlUpdate) {
      await tx.owl.update({
        where: { id: owlUpdate.id },
        data: {
          bond: owlUpdate.bond,
          statGaga: owlUpdate.statGaga,
          statGoz: owlUpdate.statGoz,
          statKulak: owlUpdate.statKulak,
          statKanat: owlUpdate.statKanat,
          statPence: owlUpdate.statPence,
          effectiveness: owlUpdate.effectiveness,
        },
      });
    }

    for (const [itemName, metaRaw] of invEntries) {
      const meta = JSON.parse(metaRaw) as { itemType: string; rarity: string; quantity: number };
      await tx.inventoryItem.upsert({
        where: { ownerId_itemName: { ownerId: playerId, itemName } },
        create: {
          ownerId: playerId,
          itemName,
          itemType: meta.itemType,
          rarity: meta.rarity,
          quantity: meta.quantity,
        },
        update: {
          quantity: meta.quantity,
        },
      });
    }
  });

  await clearDirty(redis, playerId);
}

export async function sweepDirtyPlayers(prisma: PrismaClient, redis: Redis): Promise<void> {
  const ids = await redis.smembers(DIRTY_SET);
  if (ids.length === 0) return;
  const batch = ids.slice(0, 50);
  await Promise.allSettled(batch.map((id) => persistPlayerSnapshot(prisma, redis, id)));
}

export async function getScoutingOwlCount(redis: Redis, playerId: string): Promise<number> {
  const val = await redis.get(`state:scouting:${playerId}`);
  return val ? parseInt(val, 10) : 0;
}

export async function setScoutingOwlCount(
  redis: Redis,
  prisma: PrismaClient,
  playerId: string,
): Promise<number> {
  const cached = await redis.get(`state:scouting:${playerId}`);
  if (cached !== null) return parseInt(cached, 10);
  const count = await prisma.owl.count({
    where: { ownerId: playerId, passiveMode: 'scouting', isMain: false },
  });
  await redis.set(`state:scouting:${playerId}`, String(count), 'EX', 300);
  return count;
}

export function buildLevelUpRewards(
  oldLevel: number,
  newLevel: number,
): HuntStateDelta['levelUpRewards'] {
  const rewards: NonNullable<HuntStateDelta['levelUpRewards']> = [];
  for (let lvl = oldLevel + 1; lvl <= newLevel; lvl++) {
    const r = getLevelUpReward(lvl);
    rewards.push({
      coins: r.coins,
      item: r.item,
      lootbox: r.lootbox ? { name: r.lootbox.name, quantity: r.lootbox.quantity } : undefined,
      lootbox2: r.lootbox2 ? { name: r.lootbox2.name, quantity: r.lootbox2.quantity } : undefined,
    });
  }
  return rewards;
}

/** Upgrade/PvP sonrasi owl stat guncelleme — Redis-first. */
export async function applyOwlStatUpdate(
  redis: Redis,
  prisma: PrismaClient,
  playerId: string,
  owlId: string,
  updates: Partial<Pick<CachedOwlData, 'statGaga' | 'statGoz' | 'statKulak' | 'statKanat' | 'statPence' | 'bond' | 'effectiveness'>>,
): Promise<void> {
  await loadPlayerForMutation(redis, prisma, playerId);
  let raw = await redis.get(owlKey(owlId));
  if (!raw) {
    const dbOwl = await prisma.owl.findUnique({
      where: { id: owlId },
      select: {
        id: true, ownerId: true, species: true, tier: true, bond: true,
        statGaga: true, statGoz: true, statKulak: true, statKanat: true, statPence: true,
        quality: true, hp: true, hpMax: true, staminaCur: true,
        isMain: true, effectiveness: true, traits: true,
      },
    });
    if (dbOwl) {
      await redis.set(owlKey(owlId), JSON.stringify(dbOwl));
      raw = JSON.stringify(dbOwl);
    }
  }
  if (!raw) return;
  const owl = JSON.parse(raw) as CachedOwlData;
  Object.assign(owl, updates);
  await redis.set(owlKey(owlId), JSON.stringify(owl));
  await markDirty(redis, playerId);
  enqueuePersistPlayer(playerId);
}
