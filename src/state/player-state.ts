/**
 * player-state.ts — Redis-first hot state
 *
 * Okuma/yazim once Redis; PostgreSQL sadece hydrate + arka plan persist.
 */

import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { finalXP, xpRequired, staminaMax } from '../utils/math';
import { getLevelUpReward } from '../config';
import type { XpApplyResult, LevelUpResult } from '../types';
import type { CachedOwlData, CachedPlayerData } from '../utils/player-cache';
import { enqueueDbWrite, enqueuePersistPlayer } from '../utils/db-queue';
import { withLock } from '../utils/lock';
import type { HuntHotPathMetricsCollector } from '../utils/hunt-hotpath-metrics';

/** Atomik coin mutasyonu — KEYS[1]=player, KEYS[2]=dirty ts, KEYS[3]=dirty set; ARGV[1]=miktar, ARGV[2]=deduct|delta, ARGV[3]=ts, ARGV[4]=playerId */
const COIN_MUTATE_LUA = `
local current = redis.call('GET', KEYS[1])
if not current then
  return redis.error_reply('NO_PLAYER')
end
local player = cjson.decode(current)
local coins = tonumber(player.coins) or 0
local mode = ARGV[2]
if mode == 'deduct' then
  local amount = tonumber(ARGV[1])
  if amount == nil or amount < 0 then
    return redis.error_reply('INVALID_AMOUNT')
  end
  if coins < amount then
    return redis.error_reply('INSUFFICIENT')
  end
  player.coins = coins - amount
else
  local delta = tonumber(ARGV[1])
  if delta == nil then
    return redis.error_reply('INVALID_DELTA')
  end
  player.coins = math.max(0, coins + delta)
end
redis.call('SET', KEYS[1], cjson.encode(player))
redis.call('SET', KEYS[2], ARGV[3])
redis.call('SADD', KEYS[3], ARGV[4])
return player.coins
`;

const HYDRATED_PREFIX = 'state:hydrated:';
const PLAYER_PREFIX = 'state:player:';
const OWL_PREFIX = 'state:owl:';
const INV_PREFIX = 'state:inv:';
const DIRTY_PREFIX = 'state:dirty:';
const DIRTY_SET = 'state:dirty:set';
const STATE_TTL_SECONDS = Number.parseInt(process.env.STATE_TTL_SECONDS ?? String(7 * 24 * 60 * 60), 10);

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

export interface HydratePlayerStateOptions {
  includeInventory?: boolean;
  metrics?: HuntHotPathMetricsCollector | null;
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

async function touchPlayerStateTtl(
  redis: Redis,
  playerId: string,
  mainOwlId?: string | null,
  metrics?: HuntHotPathMetricsCollector | null,
): Promise<void> {
  const pipeline = redis.pipeline();
  pipeline.expire(playerKey(playerId), STATE_TTL_SECONDS);
  pipeline.expire(hydratedKey(playerId), STATE_TTL_SECONDS);
  pipeline.expire(invKey(playerId), STATE_TTL_SECONDS);
  if (mainOwlId) {
    pipeline.expire(owlKey(mainOwlId), STATE_TTL_SECONDS);
  }
  metrics?.addRedisWrite(3 + (mainOwlId ? 1 : 0));
  await pipeline.exec();
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
  nickname: true,
  tier: true,
  bond: true,
  statGaga: true,
  statGoz: true,
  statKulak: true,
  statKanat: true,
  statPence: true,
  statGagaBase: true,
  statGozBase: true,
  statKulakBase: true,
  statKanatBase: true,
  statPenceBase: true,
  statGagaTrained: true,
  statGozTrained: true,
  statKulakTrained: true,
  statKanatTrained: true,
  statPenceTrained: true,
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
  metrics?: HuntHotPathMetricsCollector | null,
): Promise<CachedOwlData | null> {
  if (player.mainOwlId) {
    metrics?.addRedisRead();
    const cached = await redis.get(owlKey(player.mainOwlId));
    if (cached) {
      metrics?.addPgRead();
      const stillValid = await prisma.owl.findFirst({
        where: { id: player.mainOwlId, ownerId: playerId },
        select: { id: true },
      });
      if (stillValid) {
        return JSON.parse(cached) as CachedOwlData;
      }
    }
  }

  let dbOwl = player.mainOwlId
    ? await prisma.owl.findUnique({ where: { id: player.mainOwlId }, select: MAIN_OWL_SELECT })
    : null;
  if (player.mainOwlId) metrics?.addPgRead();
  if (!dbOwl || dbOwl.ownerId !== playerId) {
    dbOwl = await prisma.owl.findFirst({
      where: { ownerId: playerId, isMain: true },
      select: MAIN_OWL_SELECT,
    });
    metrics?.addPgRead();
  }
  if (!dbOwl) return null;

  const owl = dbOwl as CachedOwlData;
  metrics?.addRedisWrite();
  await redis.set(owlKey(owl.id), JSON.stringify(owl));

  if (player.mainOwlId !== owl.id) {
    player.mainOwlId = owl.id;
    metrics?.addRedisWrite();
    await redis.set(playerKey(playerId), JSON.stringify(player));
    enqueueDbWrite({
      type: 'updatePlayer',
      playerId,
      data: { mainOwlId: owl.id },
    });
    metrics?.addPersistence();
  }

  return owl;
}

/** PG'den Redis'e yukle (cache miss). */
export async function hydratePlayerState(
  redis: Redis,
  prisma: PrismaClient,
  playerId: string,
  options?: HydratePlayerStateOptions,
): Promise<PlayerStateBundle | null> {
  const includeInventory = options?.includeInventory ?? true;
  const metrics = options?.metrics;
  metrics?.addRedisRead();
  const rawPlayer = await redis.get(playerKey(playerId));
  if (rawPlayer) {
    metrics?.addCacheHit();
    const player = JSON.parse(rawPlayer) as CachedPlayerData;
    if (!player.createdAt) {
      metrics?.addPgRead();
      const createdAtRow = await prisma.player.findUnique({
        where: { id: playerId },
        select: { createdAt: true },
      });
      if (createdAtRow?.createdAt) {
        player.createdAt = createdAtRow.createdAt.toISOString();
        metrics?.addRedisWrite();
        await redis.set(playerKey(playerId), JSON.stringify(player), 'EX', STATE_TTL_SECONDS);
      }
    }
    const mainOwl = await ensureMainOwlInBundle(redis, prisma, playerId, player, metrics);
    metrics?.addRedisRead();
    if (await redis.get(hydratedKey(playerId)) !== '1') {
      metrics?.addRedisWrite();
      await redis.set(hydratedKey(playerId), '1', 'EX', STATE_TTL_SECONDS);
    }
    return { player, mainOwl };
  }
  metrics?.addCacheMiss();
  metrics?.addHydration();

  const [dbPlayer, mainOwlRow] = await Promise.all([
    prisma.player.findUnique({
      where: { id: playerId },
      select: {
        id: true, level: true, xp: true, coins: true,
        huntComboStreak: true, noRareStreak: true, mainOwlId: true,
        dailyLootboxDrops: true, lastLootboxDropDate: true,
        createdAt: true,
        prestigeLevel: true,
        gambleStreakWins: true, gambleStreakLosses: true,
      },
    }),
    prisma.owl.findFirst({
      where: { ownerId: playerId, isMain: true },
      select: MAIN_OWL_SELECT,
    }),
  ]);
  metrics?.addPgRead(2);

  if (!dbPlayer) return null;

  const player: CachedPlayerData = {
    ...dbPlayer,
    lastLootboxDropDate: dbPlayer.lastLootboxDropDate?.toISOString() ?? null,
    createdAt: dbPlayer.createdAt.toISOString(),
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
  pipeline.expire(playerKey(playerId), STATE_TTL_SECONDS);
  pipeline.expire(hydratedKey(playerId), STATE_TTL_SECONDS);
  if (mainOwl) {
    pipeline.set(owlKey(mainOwl.id), JSON.stringify(mainOwl));
    pipeline.expire(owlKey(mainOwl.id), STATE_TTL_SECONDS);
  }

  if (includeInventory) {
    const invRows = await prisma.inventoryItem.findMany({
      where: { ownerId: playerId },
      select: { itemName: true, itemType: true, rarity: true, quantity: true },
    });
    metrics?.addPgRead();
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
      pipeline.expire(invKey(playerId), STATE_TTL_SECONDS);
    }
  }

  metrics?.addRedisWrite(2 + (mainOwl ? 2 : 0) + (includeInventory ? 3 : 0));
  await pipeline.exec();
  return { player, mainOwl };
}

/** Saf JS XP hesabi — DB/Redis yazmaz. */
export function computeXpDelta(
  player: { level: number; xp: number; prestigeLevel?: number },
  amount: number,
): XpApplyResult {
  const gainedXP = Math.round(finalXP(amount, player.level));
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
  metrics?: HuntHotPathMetricsCollector | null,
  existingPlayer?: CachedPlayerData,
): Promise<CachedPlayerData> {
  const player = existingPlayer ?? await loadPlayerForMutation(redis, prisma, playerId, metrics);

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
    metrics?.addRedisRead();
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
      metrics?.addPgRead();
      if (dbOwl) {
        rawOwl = JSON.stringify(dbOwl);
      }
    }
    if (rawOwl) {
      const owl = JSON.parse(rawOwl) as CachedOwlData;
      owl.bond = Math.min(100, (owl.bond ?? 0) + delta.bondGain);
      pipeline.set(owlKey(delta.owlId), JSON.stringify(owl));
    }
  }

  // Envanter mutasyonlarini tek map'te topla, Redis'ten tek HMGET ile oku.
  const itemDeltas = new Map<string, { itemType: string; rarity: string; quantity: number }>();
  const addItemDelta = (itemName: string, itemType: string, rarity: string, quantity: number): void => {
    if (quantity <= 0) return;
    const existing = itemDeltas.get(itemName);
    if (existing) {
      existing.quantity += quantity;
      return;
    }
    itemDeltas.set(itemName, { itemType, rarity, quantity });
  };

  for (const item of delta.inventoryItems) {
    addItemDelta(item.itemName, item.itemType, item.rarity, item.quantity);
  }

  if (delta.levelUpRewards) {
    for (const reward of delta.levelUpRewards) {
      if (reward.item) {
        addItemDelta(
          reward.item.itemName,
          reward.item.itemType,
          reward.item.rarity,
          reward.item.quantity,
        );
      }
      if (reward.lootbox) {
        addItemDelta(reward.lootbox.name, 'Lootbox', 'Rare', reward.lootbox.quantity);
      }
      if (reward.lootbox2) {
        addItemDelta(reward.lootbox2.name, 'Lootbox', 'Rare', reward.lootbox2.quantity);
      }
    }
  }

  const itemNames = [...itemDeltas.keys()];
  if (itemNames.length > 0) {
    metrics?.addRedisRead(1);
    const existingRows = await redis.hmget(invKey(playerId), ...itemNames);
    for (let i = 0; i < itemNames.length; i++) {
      const itemName = itemNames[i]!;
      const deltaItem = itemDeltas.get(itemName)!;
      const existingRaw = existingRows[i];
      if (existingRaw) {
        const existing = JSON.parse(existingRaw) as { itemType: string; rarity: string; quantity: number };
        existing.quantity += deltaItem.quantity;
        pipeline.hset(invKey(playerId), itemName, JSON.stringify(existing));
      } else {
        pipeline.hset(
          invKey(playerId),
          itemName,
          JSON.stringify({
            itemType: deltaItem.itemType,
            rarity: deltaItem.rarity,
            quantity: deltaItem.quantity,
          }),
        );
      }
    }
  }

  // Player JSON + dirty flag + ttl yenileme tek pipeline'da.
  const dirtyTs = Date.now().toString();
  pipeline.set(playerKey(playerId), JSON.stringify(player));
  pipeline.set(hydratedKey(playerId), '1');
  pipeline.set(`${DIRTY_PREFIX}${playerId}`, dirtyTs);
  pipeline.sadd(DIRTY_SET, playerId);
  pipeline.expire(playerKey(playerId), STATE_TTL_SECONDS);
  pipeline.expire(hydratedKey(playerId), STATE_TTL_SECONDS);
  pipeline.expire(invKey(playerId), STATE_TTL_SECONDS);
  if (delta.owlId) {
    pipeline.expire(owlKey(delta.owlId), STATE_TTL_SECONDS);
  }
  metrics?.addRedisWrite(itemNames.length + 9 + (delta.owlId ? 1 : 0));
  const execResults = await pipeline.exec();
  if (execResults) {
    for (const [err] of execResults) {
      if (err) throw err;
    }
  }

  if (delta.totalXPGain > 0) {
    enqueueDbWrite({
      type: 'updatePlayer',
      playerId,
      data: { totalXP: { increment: delta.totalXPGain } },
    });
    metrics?.addPersistence();
  }

  enqueuePersistPlayer(playerId, delta.levelUp ? 1 : 0);
  metrics?.addPersistence();
  return player;
}

/** Redis'te yoksa PG'den hydrate et. */
async function loadPlayerForMutation(
  redis: Redis,
  prisma: PrismaClient | undefined,
  playerId: string,
  metrics?: HuntHotPathMetricsCollector | null,
): Promise<CachedPlayerData> {
  metrics?.addRedisRead();
  const raw = await redis.get(playerKey(playerId));
  if (raw) return JSON.parse(raw) as CachedPlayerData;
  if (!prisma) throw new Error('Oyuncu state bulunamadi.');
  const bundle = await hydratePlayerState(redis, prisma, playerId, { includeInventory: false, metrics });
  if (!bundle) throw new Error('Oyuncu bulunamadi.');
  return bundle.player;
}

function isRedisScriptError(err: unknown, code: string): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes(code);
}

async function mutateCoinsAtomic(
  redis: Redis,
  playerId: string,
  arg1: number,
  mode: 'deduct' | 'delta',
  prisma?: PrismaClient,
  metrics?: HuntHotPathMetricsCollector | null,
  existingPlayer?: CachedPlayerData,
): Promise<number> {
  if (mode === 'deduct' && arg1 < 0) {
    throw new Error('Yetersiz coin.');
  }

  const ts = Date.now().toString();
  const keys = [playerKey(playerId), `${DIRTY_PREFIX}${playerId}`, DIRTY_SET];
  const runEval = (): Promise<number> =>
    redis
      .eval(COIN_MUTATE_LUA, keys.length, ...keys, String(arg1), mode, ts, playerId)
      .then((result) => Number(result));

  metrics?.addRedisRead();
  const existingRaw = await redis.get(playerKey(playerId));
  if (!existingRaw) {
    if (existingPlayer) {
      metrics?.addRedisWrite(2);
      await redis
        .multi()
        .set(playerKey(playerId), JSON.stringify(existingPlayer))
        .set(hydratedKey(playerId), '1', 'EX', STATE_TTL_SECONDS)
        .exec();
    } else if (prisma) {
      await hydratePlayerState(redis, prisma, playerId, { includeInventory: false, metrics });
    } else {
      throw new Error('Oyuncu state bulunamadi.');
    }
  }

  try {
    metrics?.addRedisWrite(2);
    const finalCoins = await runEval();
    const raw = await redis.get(playerKey(playerId));
    const player = raw ? (JSON.parse(raw) as CachedPlayerData) : null;
    await touchPlayerStateTtl(redis, playerId, player?.mainOwlId ?? existingPlayer?.mainOwlId);
    await redis.del(`${PCACHE_PLAYER_PREFIX}${playerId}`);
    enqueuePersistPlayer(playerId);
    metrics?.addPersistence();
    return finalCoins;
  } catch (err) {
    if (isRedisScriptError(err, 'NO_PLAYER')) {
      if (!prisma) throw new Error('Oyuncu state bulunamadi.');
      await hydratePlayerState(redis, prisma, playerId, { includeInventory: false, metrics });
      metrics?.addRedisWrite(2);
      const finalCoins = await runEval();
      const raw = await redis.get(playerKey(playerId));
      const player = raw ? (JSON.parse(raw) as CachedPlayerData) : null;
      await touchPlayerStateTtl(redis, playerId, player?.mainOwlId);
      await redis.del(`${PCACHE_PLAYER_PREFIX}${playerId}`);
      enqueuePersistPlayer(playerId);
      metrics?.addPersistence();
      return finalCoins;
    }
    if (isRedisScriptError(err, 'INSUFFICIENT')) {
      throw new Error('Yetersiz coin.', { cause: err });
    }
    throw err;
  }
}

/** Biyom giris ucreti — Redis coin dus (atomik Lua). */
export async function deductCoinsInRedis(
  redis: Redis,
  playerId: string,
  amount: number,
  prisma?: PrismaClient,
  metrics?: HuntHotPathMetricsCollector | null,
  existingPlayer?: CachedPlayerData,
  guildId?: string | null,
): Promise<number> {
  const finalCoins = await mutateCoinsAtomic(
    redis,
    playerId,
    amount,
    'deduct',
    prisma,
    metrics,
    existingPlayer,
  );
  if (amount > 0) {
    await syncWealthLeaderboard(redis, prisma, playerId, -amount, guildId);
  }
  return finalCoins;
}

async function syncWealthLeaderboard(
  redis: Redis,
  prisma: PrismaClient | undefined,
  playerId: string,
  delta: number,
  guildId?: string | null,
): Promise<void> {
  if (!prisma || delta === 0) return;
  const { recordWealthDelta } = await import('../systems/leaderboard.js');
  await recordWealthDelta(prisma, redis, playerId, delta, guildId);
}

/** PvP / gambling coin mutasyonu (atomik Lua). */
export async function applyCoinDeltaInRedis(
  redis: Redis,
  playerId: string,
  delta: number,
  prisma?: PrismaClient,
  guildId?: string | null,
): Promise<number> {
  const finalCoins = await mutateCoinsAtomic(redis, playerId, delta, 'delta', prisma);
  await syncWealthLeaderboard(redis, prisma, playerId, delta, guildId);
  return finalCoins;
}

/** Redis-first envanter artisi (lootbox/drop gibi pathler). */
export async function addInventoryItemInRedis(
  redis: Redis,
  playerId: string,
  itemName: string,
  itemType: string,
  rarity: string,
  quantity: number,
  prisma?: PrismaClient,
): Promise<void> {
  if (quantity <= 0) return;
  // Oyuncu state'i yoksa once hydrate et (tek write-path'i koru).
  await loadPlayerForMutation(redis, prisma, playerId);
  const key = invKey(playerId);
  const existingRaw = await redis.hget(key, itemName);
  if (existingRaw) {
    const existing = JSON.parse(existingRaw) as { itemType: string; rarity: string; quantity: number };
    existing.quantity += quantity;
    await redis.hset(key, itemName, JSON.stringify(existing));
  } else {
    await redis.hset(key, itemName, JSON.stringify({ itemType, rarity, quantity }));
  }
  await markDirty(redis, playerId);
  const rawPlayer = await redis.get(playerKey(playerId));
  const player = rawPlayer ? (JSON.parse(rawPlayer) as CachedPlayerData) : null;
  await touchPlayerStateTtl(redis, playerId, player?.mainOwlId);
  enqueuePersistPlayer(playerId);
}

const PCACHE_PLAYER_PREFIX = 'pcache:player:';

/** Belirli envanter satirlarini PG'den Redis'e yansit; PG'de yoksa Redis'ten sil. */
export async function syncInventoryItemsFromPg(
  redis: Redis,
  prisma: PrismaClient,
  playerId: string,
  itemNames: string[],
): Promise<void> {
  if (itemNames.length === 0) return;
  const uniqueNames = [...new Set(itemNames)];
  const invRows = await prisma.inventoryItem.findMany({
    where: { ownerId: playerId, itemName: { in: uniqueNames } },
    select: { itemName: true, itemType: true, rarity: true, quantity: true },
  });
  const rowMap = new Map(invRows.map((row) => [row.itemName, row]));
  const key = invKey(playerId);
  const pipeline = redis.pipeline();
  for (const itemName of uniqueNames) {
    const row = rowMap.get(itemName);
    if (!row) {
      pipeline.hdel(key, itemName);
    } else {
      pipeline.hset(
        key,
        itemName,
        JSON.stringify({
          itemType: row.itemType,
          rarity: row.rarity,
          quantity: row.quantity,
        }),
      );
    }
  }
  pipeline.expire(key, STATE_TTL_SECONDS);
  await pipeline.exec();
  await markDirty(redis, playerId);
  const rawPlayer = await redis.get(playerKey(playerId));
  const player = rawPlayer ? (JSON.parse(rawPlayer) as CachedPlayerData) : null;
  await touchPlayerStateTtl(redis, playerId, player?.mainOwlId);
  enqueuePersistPlayer(playerId);
}

/** PG tüketiminden sonra tek envanter satırını Redis'e yazar (0 = hash'ten siler). */
export async function applyInventoryQuantityInRedis(
  redis: Redis,
  playerId: string,
  itemName: string,
  quantity: number,
  fallback?: { itemType: string; rarity: string },
): Promise<void> {
  const key = invKey(playerId);
  if (quantity <= 0) {
    await redis.hdel(key, itemName);
  } else {
    const existingRaw = await redis.hget(key, itemName);
    const meta = existingRaw
      ? (JSON.parse(existingRaw) as { itemType: string; rarity: string; quantity: number })
      : {
          itemType: fallback?.itemType ?? 'Item',
          rarity: fallback?.rarity ?? 'Common',
          quantity,
        };
    meta.quantity = quantity;
    await redis.hset(key, itemName, JSON.stringify(meta));
  }
  await markDirty(redis, playerId);
  const rawPlayer = await redis.get(playerKey(playerId));
  const player = rawPlayer ? (JSON.parse(rawPlayer) as CachedPlayerData) : null;
  await touchPlayerStateTtl(redis, playerId, player?.mainOwlId);
  enqueuePersistPlayer(playerId);
}

/** PG envanterini Redis'e birebir yansit (silinen satirlar Redis'ten de duser). Satis/tuketim sonrasi kullan. */
export async function mirrorInventoryFromPg(
  redis: Redis,
  prisma: PrismaClient,
  playerId: string,
): Promise<void> {
  const invRows = await prisma.inventoryItem.findMany({
    where: { ownerId: playerId },
    select: { itemName: true, itemType: true, rarity: true, quantity: true },
  });
  const pgNames = new Set(invRows.map((row) => row.itemName));
  const key = invKey(playerId);
  const existing = await redis.hkeys(key);
  const pipeline = redis.pipeline();
  for (const itemName of existing) {
    if (!pgNames.has(itemName)) {
      pipeline.hdel(key, itemName);
    }
  }
  for (const row of invRows) {
    pipeline.hset(
      key,
      row.itemName,
      JSON.stringify({
        itemType: row.itemType,
        rarity: row.rarity,
        quantity: row.quantity,
      }),
    );
  }
  pipeline.expire(key, STATE_TTL_SECONDS);
  await pipeline.exec();
  await markDirty(redis, playerId);
  const rawPlayer = await redis.get(playerKey(playerId));
  const player = rawPlayer ? (JSON.parse(rawPlayer) as CachedPlayerData) : null;
  await touchPlayerStateTtl(redis, playerId, player?.mainOwlId);
  enqueuePersistPlayer(playerId);
}


export interface InventoryQuantitySync {
  itemName: string;
  quantity: number;
  fallback?: { itemType: string; rarity: string };
}

/** PG tüketiminden sonra birden fazla envanter satırını Redis'e yazar. */
export async function syncInventoryQuantitiesInRedis(
  redis: Redis,
  playerId: string,
  lines: InventoryQuantitySync[],
): Promise<void> {
  for (const line of lines) {
    await applyInventoryQuantityInRedis(
      redis,
      playerId,
      line.itemName,
      line.quantity,
      line.fallback,
    );
  }
}

/**
 * PG envanterini Redis hash'e merge et (coin dokunulmaz).
 * PG satirlari guncellenir; yalnizca Redis'te olan (henuz persist edilmemis) item'lar korunur.
 * Tüketim sonrasi KULLANMA — syncInventoryItemsFromPg / syncInventoryQuantitiesInRedis kullan.
 */
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
  const pipeline = redis.pipeline();
  for (const row of invRows) {
    pipeline.hset(
      key,
      row.itemName,
      JSON.stringify({
        itemType: row.itemType,
        rarity: row.rarity,
        quantity: row.quantity,
      }),
    );
  }
  pipeline.expire(key, STATE_TTL_SECONDS);
  await pipeline.exec();
  await markDirty(redis, playerId);
  const rawPlayer = await redis.get(playerKey(playerId));
  const player = rawPlayer ? (JSON.parse(rawPlayer) as CachedPlayerData) : null;
  await touchPlayerStateTtl(redis, playerId, player?.mainOwlId);
  enqueuePersistPlayer(playerId);
}

/** PG coin Redis'ten gerideyse yansit; Redis daha ilerideyse stale PG ile ezme. */
function shouldApplyPgCoins(
  redisPlayer: { coins: number },
  pg: { coins: number },
): boolean {
  return pg.coins > redisPlayer.coins;
}

/** PG level/xp Redis'ten gerideyse yansit; Redis daha ilerideyse stale PG ile ezme. */
function shouldApplyPgProgress(
  redisPlayer: { level: number; xp: number },
  pg: { level: number; xp: number },
): boolean {
  if (pg.level > redisPlayer.level) return true;
  if (pg.level < redisPlayer.level) return false;
  return pg.xp > redisPlayer.xp;
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
    if (!shouldApplyPgProgress(player, db)) {
      enqueuePersistPlayer(playerId);
      return;
    }
    player.level = db.level;
    player.xp = db.xp;
    await redis.set(playerKey(playerId), JSON.stringify(player));
    await redis.set(hydratedKey(playerId), '1', 'EX', STATE_TTL_SECONDS);
    await markDirty(redis, playerId);
    await touchPlayerStateTtl(redis, playerId, player.mainOwlId);
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
    if (!shouldApplyPgCoins(player, db)) {
      enqueuePersistPlayer(playerId);
      return;
    }
    player.coins = db.coins;
    await redis.set(playerKey(playerId), JSON.stringify(player));
    await redis.set(hydratedKey(playerId), '1', 'EX', STATE_TTL_SECONDS);
    await markDirty(redis, playerId);
    await touchPlayerStateTtl(redis, playerId, player.mainOwlId);
    enqueuePersistPlayer(playerId);
  } catch {
    await invalidatePlayerState(redis, playerId);
  }
}

/** Redis hot state + eski pcache temizle — sonraki okuma PG'den hydrate eder. */
export async function invalidatePlayerState(redis: Redis, playerId: string): Promise<void> {
  const rawPlayer = await redis.get(playerKey(playerId));
  const player = rawPlayer ? (JSON.parse(rawPlayer) as CachedPlayerData) : null;
  await redis.del(
    playerKey(playerId),
    invKey(playerId),
    ...(player?.mainOwlId ? [owlKey(player.mainOwlId)] : []),
    hydratedKey(playerId),
    `${PCACHE_PLAYER_PREFIX}${playerId}`,
  );
}

/** Satıştan önce Redis envanterini PG'ye yazar. Hash yoksa PG'ye dokunmaz. */
export async function flushRedisInventoryToPg(
  redis: Redis,
  prisma: PrismaClient,
  playerId: string,
): Promise<void> {
  const key = invKey(playerId);
  if ((await redis.exists(key)) !== 1) return;
  const invHash = await redis.hgetall(key);
  const entries = Object.entries(invHash);
  if (entries.length === 0) return;
  await prisma.$transaction(
    entries.map(([itemName, metaRaw]) => {
      const meta = JSON.parse(metaRaw) as { itemType: string; rarity: string; quantity: number };
      return prisma.inventoryItem.upsert({
        where: { ownerId_itemName: { ownerId: playerId, itemName } },
        create: {
          ownerId: playerId,
          itemName,
          itemType: meta.itemType,
          rarity: meta.rarity,
          quantity: meta.quantity,
        },
        update: { quantity: meta.quantity, itemType: meta.itemType, rarity: meta.rarity },
      });
    }),
  );
}

/** Worker: dirty oyunculari PG'ye persist et. */
export async function persistPlayerSnapshot(
  prisma: PrismaClient,
  redis: Redis,
  playerId: string,
): Promise<void> {
  await withLock(playerId, 'financial', () => persistPlayerSnapshotBody(prisma, redis, playerId));
}

async function persistPlayerSnapshotBody(
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
  updates: Partial<CachedOwlData>,
): Promise<void> {
  await loadPlayerForMutation(redis, prisma, playerId);
  let raw = await redis.get(owlKey(owlId));
  if (!raw) {
    const dbOwl = await prisma.owl.findUnique({
      where: { id: owlId },
      select: MAIN_OWL_SELECT,
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

/** Hunt consumable sonrası stamina yenileme — Redis-first. */
export async function applyOwlStaminaRecoveryInRedis(
  redis: Redis,
  prisma: PrismaClient,
  playerId: string,
  owlId: string,
  amount: number,
  metrics?: HuntHotPathMetricsCollector | null,
  existingPlayer?: CachedPlayerData,
): Promise<void> {
  if (amount <= 0) return;
  if (!existingPlayer) {
    await loadPlayerForMutation(redis, prisma, playerId, metrics);
  }
  metrics?.addRedisRead();
  let raw = await redis.get(owlKey(owlId));
  if (!raw) {
    const dbOwl = await prisma.owl.findUnique({
      where: { id: owlId },
      select: MAIN_OWL_SELECT,
    });
    metrics?.addPgRead();
    if (dbOwl) {
      metrics?.addRedisWrite();
      await redis.set(owlKey(owlId), JSON.stringify(dbOwl));
      raw = JSON.stringify(dbOwl);
    }
  }
  if (!raw) return;

  const owl = JSON.parse(raw) as CachedOwlData;
  const cap = Math.round(staminaMax(owl.statKanat ?? 0));
  owl.staminaCur = Math.min(cap, owl.staminaCur + amount);
  metrics?.addRedisWrite();
  await redis.set(owlKey(owlId), JSON.stringify(owl));
  metrics?.addRedisWrite(1);
  await markDirty(redis, playerId);
  enqueuePersistPlayer(playerId);
  metrics?.addPersistence();
}
