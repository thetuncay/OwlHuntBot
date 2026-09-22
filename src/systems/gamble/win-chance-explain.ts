/**
 * win-chance-explain.ts — Kumar kazanma şansının bileşenlerini açıklar (M1 · M2).
 *
 * Kumar şansı dört gizli değiştiriciden geçiyordu: kayıp/kazanç serisi,
 * zenginlik cezası ve bahis oranı cezası. `no-hidden-mechanics` gereği bunlar
 * oyuncuya gösterilebilir olmalı.
 *
 * Bu modül **formülü tekrarlamaz** — `utils/math.ts` içindeki gerçek
 * fonksiyonları çağırıp bileşenleri ayrıştırır. Formül değişirse açıklama
 * kendiliğinden doğru kalır.
 */

import {
  GAMBLE_STREAK_LOSS_3,
  GAMBLE_STREAK_LOSS_5,
  GAMBLE_STREAK_WIN_3,
  GAMBLE_STREAK_WIN_5,
} from '../../config';
import {
  finalWinChance,
  gamblingBetPenalty,
  gamblingRichPenalty,
} from '../../utils/math';

/** Seri kaynaklı şans düzeltmesinin eşikleri — tek kaynak. */
export const STREAK_LOSS_THRESHOLD_LOW = 3;
export const STREAK_LOSS_THRESHOLD_HIGH = 5;
export const STREAK_WIN_THRESHOLD_LOW = 3;
export const STREAK_WIN_THRESHOLD_HIGH = 5;

/**
 * Kayıp/kazanç serisine bağlı şans düzeltmesi (puan).
 *
 * Pozitif değer = kötü şans koruması (M2). Negatif değer = kazanç serisi
 * frenlemesi. `systems/gambling.ts` içindeki `streakModifier` ile birebir
 * aynı mantık; ikisi ayrışmasın diye test bunu doğrular.
 *
 * @param streakWins Üst üste kazanç sayısı
 * @param streakLosses Üst üste kayıp sayısı
 */
export function streakChanceModifier(streakWins: number, streakLosses: number): number {
  if (streakLosses >= STREAK_LOSS_THRESHOLD_HIGH) return GAMBLE_STREAK_LOSS_5;
  if (streakLosses >= STREAK_LOSS_THRESHOLD_LOW) return GAMBLE_STREAK_LOSS_3;
  if (streakWins >= STREAK_WIN_THRESHOLD_HIGH) return GAMBLE_STREAK_WIN_5;
  if (streakWins >= STREAK_WIN_THRESHOLD_LOW) return GAMBLE_STREAK_WIN_3;
  return 0;
}

export interface WinChanceInput {
  /** Oyunun temel kazanma şansı (yüzde). */
  baseChance: number;
  /** Oyuncunun mevcut coin bakiyesi. */
  coins: number;
  /** Bahis miktarı. */
  bet: number;
  streakWins: number;
  streakLosses: number;
  /** Retention kaynaklı ek puan (varsa). */
  retentionPoints?: number;
}

export interface WinChanceBreakdown {
  base: number;
  /** Kayıp serisi koruması — pozitifse şans artmış (M2). */
  streakRelief: number;
  /** Kazanç serisi frenlemesi — negatif puan. */
  streakDampener: number;
  /** Zenginlik cezası (pozitif sayı, şanstan düşülür). */
  richPenalty: number;
  /** Büyük bahis cezası (pozitif sayı, şanstan düşülür). */
  betPenalty: number;
  retentionBonus: number;
  /** Clamp uygulanmış nihai şans. */
  final: number;
}

/**
 * Nihai şansı ve onu oluşturan bileşenleri verir.
 *
 * @param input Oyuncunun anlık durumu ve bahis
 */
export function explainWinChance(input: WinChanceInput): WinChanceBreakdown {
  const streakMod = streakChanceModifier(input.streakWins, input.streakLosses);
  const retentionBonus = input.retentionPoints ?? 0;
  const modifier = streakMod + retentionBonus;

  return {
    base: input.baseChance,
    streakRelief: streakMod > 0 ? streakMod : 0,
    streakDampener: streakMod < 0 ? streakMod : 0,
    richPenalty: gamblingRichPenalty(input.coins),
    betPenalty: gamblingBetPenalty(input.bet, input.coins),
    retentionBonus,
    final: finalWinChance(input.baseChance, input.coins, input.bet, modifier),
  };
}

/**
 * Kayıp serisi koruması aktifse oyuncuya gösterilecek kısa satır (M2).
 *
 * Koruma zaten kodda vardı ama gizliydi; görünür olması hem güven verir hem
 * de `no-hidden-mechanics` kuralını karşılar. Ekonomiye yeni kaynak eklemez —
 * yalnızca mevcut mekaniği ilan eder.
 *
 * @param streakLosses Üst üste kayıp sayısı
 * @returns Gösterilecek satır veya koruma aktif değilse `null`
 */
export function buildLossReliefNote(streakLosses: number): string | null {
  const relief = streakChanceModifier(0, streakLosses);
  if (relief <= 0) return null;
  return `🛟 Kötü şans koruması aktif · şansın **+${relief}** puan`;
}
