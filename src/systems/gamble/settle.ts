import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { GAMBLE_SETTLEMENT_REDIS_PREFIX, GAMBLE_SETTLEMENT_TTL_SEC } from '../../config';
import { applyCoinDeltaInRedis, hydratePlayerState } from '../../state/player-state';
import { withLock } from '../../utils/lock';
import type { GambleSettlementResult } from './types';

function settlementKey(settlementId: string): string {
  return `${GAMBLE_SETTLEMENT_REDIS_PREFIX}${settlementId}`;
}

const PLAYER_STATE_PREFIX = 'state:player:';

async function readCurrentCoins(
  redis: Redis,
  prisma: PrismaClient,
  playerId: string,
): Promise<number | undefined> {
  const raw = await redis.get(`${PLAYER_STATE_PREFIX}${playerId}`);
  if (raw) {
    const player = JSON.parse(raw) as { coins?: number };
    return typeof player.coins === 'number' ? player.coins : undefined;
  }
  const bundle = await hydratePlayerState(redis, prisma, playerId, { includeInventory: false }).catch(() => null);
  return bundle?.player.coins;
}

/**
 * Idempotent coin settlement — duplicate settlementId → delta 0.
 */
export async function settleGambleRound(
  prisma: PrismaClient,
  redis: Redis | undefined,
  params: {
    playerId: string;
    settlementId: string;
    delta: number;
  },
): Promise<GambleSettlementResult> {
  const { playerId, settlementId, delta } = params;

  if (redis) {
    const key = settlementKey(settlementId);
    const acquired = await redis.set(key, playerId, 'EX', GAMBLE_SETTLEMENT_TTL_SEC, 'NX');
    if (acquired !== 'OK') {
      return { applied: false, delta: 0 };
    }

    if (delta === 0) {
      const finalCoins = await readCurrentCoins(redis, prisma, playerId);
      return { applied: true, delta: 0, finalCoins };
    }

    const finalCoins = await withLock(playerId, 'financial', () =>
      applyCoinDeltaInRedis(redis, playerId, delta, prisma),
    );
    return { applied: true, delta, finalCoins };
  }

  // Redis yok — DB-only fallback (test / legacy)
  const actionKey = `gamble_settlement:${settlementId}`;
  const existing = await prisma.auditLog.findFirst({
    where: { action: actionKey },
    select: { id: true },
  });
  if (existing) {
    return { applied: false, delta: 0 };
  }

  if (delta === 0) {
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { coins: true },
    });
    await prisma.auditLog.create({
      data: {
        playerId,
        action: actionKey,
        before: {},
        after: { delta: 0 },
      },
    });
    return { applied: true, delta: 0, finalCoins: player?.coins };
  }

  const updated = await withLock(playerId, 'financial', async () => {
    const player = await prisma.player.findUnique({ where: { id: playerId }, select: { coins: true } });
    if (!player) throw new Error('Oyuncu bulunamadi.');
    const next = player.coins + delta;
    if (next < 0) throw new Error('Yetersiz bakiye.');

    const row = await prisma.player.update({
      where: { id: playerId },
      data: { coins: { increment: delta } },
      select: { coins: true },
    });

    await prisma.auditLog.create({
      data: {
        playerId,
        action: actionKey,
        before: { coins: player.coins },
        after: { coins: row.coins, delta },
      },
    });

    return row.coins;
  });

  return { applied: true, delta, finalCoins: updated };
}

/** Test / admin — settlement kilidini kaldır */
export async function clearSettlementLock(redis: Redis, settlementId: string): Promise<void> {
  await redis.del(settlementKey(settlementId));
}
