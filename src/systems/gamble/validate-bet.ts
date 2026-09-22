import { formatCoinLabel } from '../../config/ui-emojis';
import { GAMBLE_MAX_BET, GAMBLE_MIN_BET } from '../../config';
import type { GambleBetValidation } from './types';

export interface ValidateGambleBetOptions {
  minBet?: number;
  maxBet?: number;
  playerCoins: number;
}

/**
 * Merkezi bahis doğrulama — tüm kumar oyunları bu fonksiyonu kullanır.
 */
export function validateGambleBet(
  betRaw: unknown,
  options: ValidateGambleBetOptions,
): GambleBetValidation {
  const minBet = options.minBet ?? GAMBLE_MIN_BET;
  const maxBet = options.maxBet ?? GAMBLE_MAX_BET;
  const { playerCoins } = options;

  if (typeof betRaw !== 'number' || !Number.isFinite(betRaw)) {
    return {
      ok: false,
      code: 'invalid_number',
      message: 'Bahis geçerli bir sayı olmalı.',
    };
  }

  if (!Number.isSafeInteger(betRaw)) {
    return {
      ok: false,
      code: 'not_integer',
      message: 'Bahis tam sayı olmalı.',
    };
  }

  const bet = betRaw;

  if (bet <= 0) {
    return {
      ok: false,
      code: 'not_positive',
      message: 'Bahis sıfırdan büyük olmalı.',
    };
  }

  if (bet < minBet) {
    return {
      ok: false,
      code: 'below_minimum',
      message: `Minimum bahis ${formatCoinLabel(minBet)}.`,
    };
  }

  if (bet > maxBet) {
    return {
      ok: false,
      code: 'above_maximum',
      message: `Maksimum bahis ${formatCoinLabel(maxBet)}.`,
    };
  }

  if (bet > playerCoins) {
    return {
      ok: false,
      code: 'insufficient_balance',
      message: 'Yetersiz bakiye.',
    };
  }

  return { ok: true, bet };
}
