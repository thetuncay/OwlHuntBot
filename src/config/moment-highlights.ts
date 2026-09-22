/**
 * moment-highlights.ts — Nadir başarı anlarının görsel sinyali (L3).
 *
 * Kural: **her** başarıya görsel vermek "özel" hissini öldürür. Bu yüzden
 * havuz kasıtlı olarak küçük ve eşikler yüksek. Yeni bir moment eklemeden önce
 * "bu gerçekten nadir mi?" sorusu cevaplanmalı.
 *
 * Sinyal metnin yerine geçmez, metne eşlik eder — `no-ui-noise` gereği
 * açıklama satırı eklemez, sadece işaret koyar.
 */

import { COLORS } from '../utils/theme';

/**
 * Görsel vurgu hak eden an tipleri.
 *
 * - `rare-prey`  — yüksek tier av yakalandı
 * - `legendary`  — kutudan Legendary çıktı
 * - `god-roll`   — God Roll kalitede baykuş
 */
export type MomentKind = 'rare-prey' | 'legendary' | 'god-roll';

export interface MomentHighlight {
  /** Metnin yanına konan işaret. */
  marker: string;
  /** Embed kullanan ekranlar için renk. */
  color: number;
}

export const MOMENT_HIGHLIGHTS: Record<MomentKind, MomentHighlight> = {
  'rare-prey': { marker: '✨', color: COLORS.RARE },
  legendary:   { marker: '🌟', color: COLORS.RARE },
  'god-roll':  { marker: '🌟', color: COLORS.RARE },
};

/**
 * An tipi için işareti verir.
 *
 * @param kind Vurgulanacak an tipi
 */
export function momentMarker(kind: MomentKind): string {
  return MOMENT_HIGHLIGHTS[kind].marker;
}
