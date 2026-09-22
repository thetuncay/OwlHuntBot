import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { randomUUID } from 'crypto';
import {
  GAMBLE_BJ_BLACKJACK_PAYOUT,
  GAMBLE_BJ_WIN_PAYOUT,
} from '../../config';
import { applyCoinDeltaInRedis, hydratePlayerState } from '../../state/player-state';
import type { GambleResult } from '../../types';
import { withLock } from '../../utils/lock';
import { writeAudit } from '../../utils/audit';
import { enqueueDbWrite } from '../../utils/db-queue';
import { settleGambleRound } from './settle';
import {
  clearSoloBjSession,
  loadSoloBjSession,
  saveSoloBjSession,
  type SoloBjSession,
} from './session-bj';
import type { SoloBlackjackOutcome } from './types';
import { validateGambleBet } from './validate-bet';

export function computeSoloBjPayoutTotal(bet: number, outcome: SoloBlackjackOutcome): number {
  switch (outcome) {
    case 'blackjack':
      return Math.floor(bet * GAMBLE_BJ_BLACKJACK_PAYOUT);
    case 'win':
      return Math.floor(bet * GAMBLE_BJ_WIN_PAYOUT);
    case 'tie':
      return bet;
    case 'lose':
    default:
      return 0;
  }
}

/** Escrow sonrası net kazanç (UI için deltaCoins) */
export function computeSoloBjNetDelta(bet: number, outcome: SoloBlackjackOutcome): number {
  return computeSoloBjPayoutTotal(bet, outcome) - bet;
}

export async function escrowSoloBjBet(
  prisma: PrismaClient,
  redis: Redis,
  userId: string,
  bet: number,
): Promise<void> {
  const bundle = await hydratePlayerState(redis, prisma, userId);
  if (!bundle) throw new Error('Oyuncu bulunamadi.');

  const check = validateGambleBet(bet, { playerCoins: bundle.player.coins });
  if (!check.ok) throw new Error(check.message ?? 'Bahis geçersiz.');

  await withLock(userId, 'financial', () =>
    applyCoinDeltaInRedis(redis, userId, -bet, prisma),
  );
}

export async function beginSoloBlackjackSession(
  prisma: PrismaClient,
  redis: Redis,
  params: {
    userId: string;
    bet: number;
    username: string;
    playerHand: SoloBjSession['playerHand'];
    dealerHand: SoloBjSession['dealerHand'];
    deck: SoloBjSession['deck'];
  },
): Promise<SoloBjSession> {
  const existing = await loadSoloBjSession(redis, params.userId);
  if (existing) {
    throw new Error('Aktif Gölge 21 elin var. Devam etmek için `w bj` yaz.');
  }

  const settlementId = randomUUID();
  await escrowSoloBjBet(prisma, redis, params.userId, params.bet);

  const session: SoloBjSession = {
    userId: params.userId,
    bet: params.bet,
    settlementId,
    username: params.username,
    playerHand: params.playerHand,
    dealerHand: params.dealerHand,
    deck: params.deck,
    createdAt: Date.now(),
  };

  await saveSoloBjSession(redis, session);
  return session;
}

export async function settleSoloBlackjack(
  prisma: PrismaClient,
  redis: Redis,
  userId: string,
  outcome: SoloBlackjackOutcome,
): Promise<GambleResult & { settlementApplied: boolean }> {
  const session = await loadSoloBjSession(redis, userId);
  if (!session) {
    throw new Error('Aktif blackjack eli bulunamadi.');
  }

  const payoutTotal = computeSoloBjPayoutTotal(session.bet, outcome);
  const netDelta = computeSoloBjNetDelta(session.bet, outcome);
  const win = outcome === 'win' || outcome === 'blackjack';

  try {
    const settlement = await settleGambleRound(prisma, redis, {
      playerId: userId,
      settlementId: session.settlementId,
      delta: payoutTotal,
    });

    if (settlement.applied && payoutTotal > 0) {
      enqueueDbWrite({
        type: 'updatePlayer',
        playerId: userId,
        data: {
          gambleStreakWins: win ? { increment: 1 } : 0,
          gambleStreakLosses: win ? 0 : { increment: 1 },
        },
      });
    }

    writeAudit(prisma, userId, 'gamble', { bet: session.bet, outcome }, {
      payoutTotal,
      netDelta,
      settlementId: session.settlementId,
      applied: settlement.applied,
      game: 'solo_blackjack',
    }).catch(console.error);

    return {
      win,
      deltaCoins: netDelta,
      finalCoins: settlement.finalCoins ?? 0,
      message: outcome,
      settlementApplied: settlement.applied,
    };
  } finally {
    await clearSoloBjSession(redis, userId);
  }
}

export async function refundSoloBlackjackEscrow(
  prisma: PrismaClient,
  redis: Redis,
  userId: string,
): Promise<boolean> {
  const session = await loadSoloBjSession(redis, userId);
  if (!session) return false;

  try {
    await withLock(userId, 'financial', () =>
      applyCoinDeltaInRedis(redis, userId, session.bet, prisma),
    );
  } finally {
    await clearSoloBjSession(redis, userId);
  }
  return true;
}
