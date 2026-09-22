/** Oyuncuya gösterilen terim sözlüğü — config tier numaraları değişmez. */

const TIER_LABELS: Record<number, string> = {
  1: 'Efsane',
  2: 'Usta',
  3: 'Elit',
  4: 'Deneyimli',
  5: 'Standart',
  6: 'Acemi',
  7: 'Çırak',
  8: 'Başlangıç',
};

export function formatTierLabel(tier: number): string {
  const label = TIER_LABELS[tier];
  return label ? `${label} (T${tier})` : `T${tier}`;
}

export function formatEffectivenessLabel(value: number): string {
  return `Verim **${Math.round(value)}%**`;
}

export function formatPowerLabel(value: number): string {
  return `Güç **${Math.round(value).toLocaleString('tr-TR')}**`;
}

export const TERM_EFFECTIVENESS = 'Verim';
export const TERM_POWER = 'Güç';
