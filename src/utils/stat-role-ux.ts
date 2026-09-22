/**
 * Stat rolleri — stats / upgrade ekranlarında kısa ipucu metinleri.
 */
import type { OwlStatKey } from '../types';

/** Oyuncuya gösterilen kısa rol açıklaması (italic ile kullanılır). */
export const STAT_ROLE: Record<OwlStatKey, string> = {
  pence: 'yakalama · PvP',
  gaga:  'PvP · dövüş',
  goz:   'yakala · keşif · tame',
  kulak: 'keşif · tame',
  kanat: 'stamina · hız',
};

export function formatStatRole(stat: OwlStatKey): string {
  return `*${STAT_ROLE[stat]}*`;
}

/** Performans skorlarının hangi statlardan geldiği. */
export const STATS_SCORE_LEGEND =
  '*Güç = Gaga+Pençe · Keşif = Göz+Kulak · Hız = Kanat*';

/** Stats embed alt bilgi — tek satır özet. */
export const STATS_EMBED_FOOTER =
  'Pençe→yakala · Göz/Kulak→keşif · Kanat→stamina';
