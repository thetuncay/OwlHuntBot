import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { GAMBLE_MAX_BET } from '../../config';
import { hydratePlayerState } from '../../state/player-state';
import { validateGambleBet, type ValidateGambleBetOptions } from './validate-bet';
import type { GambleBetValidation } from './types';

const ALL_BET_TOKENS = new Set(['all', 'hepsi', 'tumu', 'tümü']);

export function isAllBetToken(raw: string): boolean {
  return ALL_BET_TOKENS.has(raw.toLowerCase().trim());
}

export function isGambleBetArgToken(raw: string): boolean {
  return /^\d+$/.test(raw) || isAllBetToken(raw);
}

export function parseBetTokenFromArgs(args: string[]): string | undefined {
  return args.find((a) => isGambleBetArgToken(a));
}

export function resolveAllInBetAmount(playerCoins: number, maxBet = GAMBLE_MAX_BET): number {
  return Math.min(playerCoins, maxBet);
}

export function resolveGambleBetFromToken(
  token: string,
  playerCoins: number,
  options?: Omit<ValidateGambleBetOptions, 'playerCoins'>,
): GambleBetValidation {
  if (isAllBetToken(token)) {
    const maxBet = options?.maxBet ?? GAMBLE_MAX_BET;
    const amount = resolveAllInBetAmount(playerCoins, maxBet);
    return validateGambleBet(amount, { ...options, playerCoins });
  }

  const bet = Number.parseInt(token, 10);
  if (!Number.isFinite(bet)) {
    return {
      ok: false,
      code: 'invalid_number',
      message: 'Bahis geçerli bir sayı olmalı.',
    };
  }
  return validateGambleBet(bet, { ...options, playerCoins });
}

export async function getPlayerGambleBalance(
  prisma: PrismaClient,
  redis: Redis | undefined,
  playerId: string,
): Promise<number> {
  if (redis) {
    const bundle = await hydratePlayerState(redis, prisma, playerId, { includeInventory: false });
    if (bundle) return bundle.player.coins;
  }
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { coins: true },
  });
  return player?.coins ?? 0;
}

export type ResolvedGambleBetArgs =
  | { ok: true; bet: number }
  | { ok: false; hasToken: false }
  | { ok: false; hasToken: true; message: string };

export async function resolveGambleBetFromArgs(
  prisma: PrismaClient,
  redis: Redis | undefined,
  playerId: string,
  args: string[],
  options?: Omit<ValidateGambleBetOptions, 'playerCoins'>,
): Promise<ResolvedGambleBetArgs> {
  const token = parseBetTokenFromArgs(args);
  if (!token) return { ok: false, hasToken: false };

  const playerCoins = await getPlayerGambleBalance(prisma, redis, playerId);
  const result = resolveGambleBetFromToken(token, playerCoins, options);
  if (!result.ok) {
    return { ok: false, hasToken: true, message: result.message ?? 'Bahis geçersiz.' };
  }
  return { ok: true, bet: result.bet! };
}
