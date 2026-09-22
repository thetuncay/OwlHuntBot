import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import {
  GAMBLE_DUEL_GUARD_PREFIX,
  GAMBLE_DUELBET_REDIS_PREFIX,
  GAMBLE_SETTLEMENT_TTL_SEC,
} from '../../config';
import { applyCoinDeltaInRedis, hydratePlayerState } from '../../state/player-state';
import { runWithFinancialLocks } from '../economy-transaction-manager';
import type { DuelBetEscrowMeta } from './types';
import { validateGambleBet } from './validate-bet';

function duelBetKey(sessionId: string): string {
  return `${GAMBLE_DUELBET_REDIS_PREFIX}${sessionId}`;
}

function duelGuardKey(userId: string): string {
  return `${GAMBLE_DUEL_GUARD_PREFIX}${userId}`;
}

export async function getActiveGambleDuelSession(
  redis: Redis,
  userId: string,
  prisma?: PrismaClient,
): Promise<string | null> {
  const sessionId = await redis.get(duelGuardKey(userId));
  if (!sessionId) return null;

  const meta = await getDuelBetEscrow(redis, sessionId);
  if (!meta) {
    await clearGambleDuelGuard(redis, userId);
    return null;
  }

  if (prisma) {
    const pvp = await prisma.pvpSession.findUnique({
      where: { id: sessionId },
      select: { status: true },
    });
    if (pvp?.status === 'finished') {
      await finalizeDuelBetEscrow(redis, sessionId);
      return null;
    }
  }

  return sessionId;
}

export async function setGambleDuelGuard(
  redis: Redis,
  userId: string,
  sessionId: string,
  ttlSec: number,
): Promise<boolean> {
  const result = await redis.set(duelGuardKey(userId), sessionId, 'EX', ttlSec, 'NX');
  return result === 'OK';
}

export async function clearGambleDuelGuard(redis: Redis, userId: string): Promise<void> {
  await redis.del(duelGuardKey(userId));
}

export async function getDuelBetEscrow(
  redis: Redis,
  sessionId: string,
): Promise<DuelBetEscrowMeta | null> {
  const raw = await redis.get(duelBetKey(sessionId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DuelBetEscrowMeta;
  } catch {
    return null;
  }
}

export interface EscrowBothPlayersParams {
  prisma: PrismaClient;
  redis: Redis;
  sessionId: string;
  settlementId: string;
  bet: number;
  challengerId: string;
  defenderId: string;
  ttlSec?: number;
}

/**
 * Accept anında iki tarafın coin'ini düşer ve escrow meta kaydı oluşturur.
 * Hata durumunda refundEscrow çağrılmalıdır.
 */
export async function escrowBothPlayers(
  params: EscrowBothPlayersParams,
): Promise<DuelBetEscrowMeta> {
  const {
    prisma,
    redis,
    sessionId,
    settlementId,
    bet,
    challengerId,
    defenderId,
    ttlSec = GAMBLE_SETTLEMENT_TTL_SEC,
  } = params;

  const [challengerBundle, defenderBundle] = await Promise.all([
    hydratePlayerState(redis, prisma, challengerId),
    hydratePlayerState(redis, prisma, defenderId),
  ]);

  const challengerCoins = challengerBundle?.player.coins ?? 0;
  const defenderCoins = defenderBundle?.player.coins ?? 0;

  const challengerCheck = validateGambleBet(bet, { playerCoins: challengerCoins });
  if (!challengerCheck.ok) {
    throw new Error(challengerCheck.message ?? 'Challenger bahis geçersiz.');
  }
  const defenderCheck = validateGambleBet(bet, { playerCoins: defenderCoins });
  if (!defenderCheck.ok) {
    throw new Error(defenderCheck.message ?? 'Defender bahis geçersiz.');
  }

  const guardOk = await Promise.all([
    setGambleDuelGuard(redis, challengerId, sessionId, ttlSec),
    setGambleDuelGuard(redis, defenderId, sessionId, ttlSec),
  ]);
  if (!guardOk.every(Boolean)) {
    await Promise.all([
      clearGambleDuelGuard(redis, challengerId),
      clearGambleDuelGuard(redis, defenderId),
    ]);
    throw new Error('Oyunculardan biri zaten aktif bir duel/kumar sürecinde.');
  }

  try {
    await runWithFinancialLocks([challengerId, defenderId], async () => {
      await applyCoinDeltaInRedis(redis, challengerId, -bet, prisma);
      await applyCoinDeltaInRedis(redis, defenderId, -bet, prisma);
    });

    const meta: DuelBetEscrowMeta = {
      sessionId,
      settlementId,
      bet,
      challengerId,
      defenderId,
      escrowedAt: Date.now(),
    };

    await redis.set(duelBetKey(sessionId), JSON.stringify(meta), 'EX', ttlSec);
    return meta;
  } catch (err) {
    await refundEscrow({ prisma, redis, sessionId }).catch(() => null);
    throw err;
  }
}

export interface RefundEscrowParams {
  prisma: PrismaClient;
  redis: Redis;
  sessionId: string;
}

/** Başarılı duelbet sonrası escrow meta + guard temizliği (coin iadesi yok). Idempotent. */
export async function finalizeDuelBetEscrow(redis: Redis, sessionId: string): Promise<void> {
  const meta = await getDuelBetEscrow(redis, sessionId);
  if (!meta) return;

  await redis.del(duelBetKey(sessionId));
  await Promise.all([
    clearGambleDuelGuard(redis, meta.challengerId),
    clearGambleDuelGuard(redis, meta.defenderId),
  ]);
}

/** Escrow'u iade eder ve guard'ları temizler. Idempotent — meta yoksa no-op. */
export async function refundEscrow(params: RefundEscrowParams): Promise<boolean> {
  const { prisma, redis, sessionId } = params;
  const meta = await getDuelBetEscrow(redis, sessionId);
  if (!meta) {
    return false;
  }

  try {
    await runWithFinancialLocks([meta.challengerId, meta.defenderId], async () => {
      await applyCoinDeltaInRedis(redis, meta.challengerId, meta.bet, prisma);
      await applyCoinDeltaInRedis(redis, meta.defenderId, meta.bet, prisma);
    });
  } finally {
    await finalizeDuelBetEscrow(redis, sessionId);
  }

  return true;
}
