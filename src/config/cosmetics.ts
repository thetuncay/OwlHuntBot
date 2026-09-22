/**
 * Kozmetik unvanlar (D3) — güç vermez, yalnızca görünür kimlik.
 *
 * Hepsi oyun-içi kazanılır. Pay-only yok (economy-safety X10).
 */

export interface CosmeticTitleDef {
  id: string;
  label: string;
  /** Kısa nasıl-kazanılır — help / stats. */
  how: string;
}

export const COSMETIC_TITLES: readonly CosmeticTitleDef[] = [
  { id: 'iz', label: 'İz Sürücü', how: 'İlk 5 av' },
  { id: 'seri', label: 'Seri Avcı', how: 'İlk av serisi (25)' },
  { id: 'defter', label: 'Defter Ustası', how: 'Av defterini tamamla' },
  { id: 'ay', label: 'Ay Yolcusu', how: 'Moon III evrim' },
] as const;

export type CosmeticTitleId = (typeof COSMETIC_TITLES)[number]['id'];

export const COSMETIC_TITLE_BY_ID: Readonly<Record<string, CosmeticTitleDef>> =
  Object.fromEntries(COSMETIC_TITLES.map((t) => [t.id, t]));

/** Redis: cosmetic:titles:{userId} → JSON string[] */
export const COSMETIC_TITLES_REDIS_PREFIX = 'cosmetic:titles:';
