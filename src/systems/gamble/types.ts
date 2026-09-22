export type GambleBetValidationCode =
  | 'invalid_number'
  | 'not_integer'
  | 'not_positive'
  | 'below_minimum'
  | 'above_maximum'
  | 'insufficient_balance';

export interface GambleBetValidation {
  ok: boolean;
  bet?: number;
  code?: GambleBetValidationCode;
  message?: string;
}

export interface GambleSettlementResult {
  /** İlk kez uygulandı mı (duplicate settlementId → false) */
  applied: boolean;
  delta: number;
  finalCoins?: number;
}

export interface DuelBetEscrowMeta {
  sessionId: string;
  settlementId: string;
  bet: number;
  challengerId: string;
  defenderId: string;
  escrowedAt: number;
}

export type SoloBlackjackOutcome = 'win' | 'lose' | 'tie' | 'blackjack';
