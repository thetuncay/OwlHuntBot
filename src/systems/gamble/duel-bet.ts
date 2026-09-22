import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { randomUUID } from 'crypto';
import {
  DUELBET_INVITE_TTL_MS,
  DUELBET_MIN_BET,
  GAMBLE_DUELBET_INVITE_PREFIX,
  GAMBLE_SETTLEMENT_TTL_SEC,
} from '../../config';
import type { PvpSimResult } from '../../types';
import { startPvP, simulatePvP, closePvpSessionIfPending } from '../pvp';
import {
  escrowBothPlayers,
  finalizeDuelBetEscrow,
  getActiveGambleDuelSession,
  refundEscrow,
} from './escrow';
import { settleGambleRound } from './settle';
import { validateGambleBet } from './validate-bet';

export interface DuelBetInvite {
  inviteId: string;
  challengerId: string;
  defenderId: string;
  bet: number;
  createdAt: number;
}

function inviteKey(inviteId: string): string {
  return `${GAMBLE_DUELBET_INVITE_PREFIX}${inviteId}`;
}

export async function saveDuelBetInvite(redis: Redis, invite: DuelBetInvite): Promise<void> {
  const ttlSec = Math.ceil(DUELBET_INVITE_TTL_MS / 1000);
  await redis.set(inviteKey(invite.inviteId), JSON.stringify(invite), 'EX', ttlSec);
}

export async function getDuelBetInvite(redis: Redis, inviteId: string): Promise<DuelBetInvite | null> {
  const raw = await redis.get(inviteKey(inviteId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DuelBetInvite;
  } catch {
    return null;
  }
}

export async function deleteDuelBetInvite(redis: Redis, inviteId: string): Promise<void> {
  await redis.del(inviteKey(inviteId));
}

export async function validateDuelBetOffer(
  prisma: PrismaClient,
  redis: Redis,
  challengerId: string,
  defenderId: string,
  bet: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (challengerId === defenderId) {
    return { ok: false, message: 'Kendine bahisli düello daveti gönderemezsin.' };
  }

  const [challenger, defender] = await Promise.all([
    prisma.player.findUnique({ where: { id: challengerId }, select: { coins: true } }),
    prisma.player.findUnique({ where: { id: defenderId }, select: { coins: true } }),
  ]);

  const challengerCheck = validateGambleBet(bet, {
    minBet: DUELBET_MIN_BET,
    playerCoins: challenger?.coins ?? 0,
  });
  if (!challengerCheck.ok) {
    return { ok: false, message: challengerCheck.message ?? 'Bahis geçersiz.' };
  }

  const defenderCheck = validateGambleBet(bet, {
    minBet: DUELBET_MIN_BET,
    playerCoins: defender?.coins ?? 0,
  });
  if (!defenderCheck.ok) {
    return { ok: false, message: 'Rakibinin bu bahisi karşılayacak kadar coin\'i yok.' };
  }

  const [challengerDuel, defenderDuel] = await Promise.all([
    getActiveGambleDuelSession(redis, challengerId, prisma),
    getActiveGambleDuelSession(redis, defenderId, prisma),
  ]);
  if (challengerDuel || defenderDuel) {
    return { ok: false, message: 'Oyunculardan biri zaten aktif bir duel/kumar sürecinde.' };
  }

  return { ok: true };
}

export async function createDuelBetInvite(
  prisma: PrismaClient,
  redis: Redis,
  challengerId: string,
  defenderId: string,
  bet: number,
): Promise<DuelBetInvite> {
  const check = await validateDuelBetOffer(prisma, redis, challengerId, defenderId, bet);
  if (!check.ok) throw new Error(check.message);

  const invite: DuelBetInvite = {
    inviteId: randomUUID(),
    challengerId,
    defenderId,
    bet,
    createdAt: Date.now(),
  };
  await saveDuelBetInvite(redis, invite);
  return invite;
}

export interface DuelBetRunResult {
  winnerId: string;
  loserId: string;
  bet: number;
  pvpSessionId: string;
  settlementApplied: boolean;
  battle: PvpSimResult;
}

/**
 * Accept sonrası: escrow → simulatePvP(duelBetMode) → kazanan pot.
 */
export async function runDuelBetBattle(
  prisma: PrismaClient,
  redis: Redis,
  invite: DuelBetInvite,
  guildId?: string | null,
): Promise<DuelBetRunResult> {
  const revalidate = await validateDuelBetOffer(
    prisma,
    redis,
    invite.challengerId,
    invite.defenderId,
    invite.bet,
  );
  if (!revalidate.ok) throw new Error(revalidate.message);

  const pvpSessionId = await startPvP(prisma, invite.challengerId, invite.defenderId);
  const settlementId = randomUUID();

  let escrowed = false;
  try {
    await escrowBothPlayers({
      prisma,
      redis,
      sessionId: pvpSessionId,
      settlementId,
      bet: invite.bet,
      challengerId: invite.challengerId,
      defenderId: invite.defenderId,
      ttlSec: GAMBLE_SETTLEMENT_TTL_SEC,
    });
    escrowed = true;

    const sim = await simulatePvP(prisma, pvpSessionId, redis, guildId, { duelBetMode: true });
    const winnerId = sim.winnerId;
    const loserId = sim.loserId;
    const potPayout = invite.bet * 2;

    const settlement = await settleGambleRound(prisma, redis, {
      playerId: winnerId,
      settlementId: `${settlementId}:payout`,
      delta: potPayout,
    });

    await finalizeDuelBetEscrow(redis, pvpSessionId);

    return {
      winnerId,
      loserId,
      bet: invite.bet,
      pvpSessionId,
      settlementApplied: settlement.applied,
      battle: sim,
    };
  } catch (err) {
    if (escrowed) {
      await refundEscrow({ prisma, redis, sessionId: pvpSessionId }).catch(() => null);
    }
    await closePvpSessionIfPending(prisma, pvpSessionId);
    throw err;
  }
}
