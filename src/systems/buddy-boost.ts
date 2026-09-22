/**
 * buddy-boost.ts — İlk avlar rehber satırı (H3).
 *
 * Skip yok: limit sonrası kendiliğinden susar. Uzun dialog yok.
 */

import { BUDDY_BOOST_HUNT_LIMIT } from '../config/engagement';

const BUDDY_LINES = [
  '🦉 Rehber: Avlarını sat (Owl sell) veya parçala (Owl parçala)',
  '🦉 Rehber: Göz ve pençeni güçlendirmek avları attırabilir. `w up` ile dene.',
] as const;

/**
 * İlk avlar için rehber satırı.
 *
 * @param huntCount Bu avdan sonraki toplam (1-indexed)
 */
export function buddyBoostLine(huntCount: number): string | null {
  if (huntCount < 1 || huntCount > BUDDY_BOOST_HUNT_LIMIT) return null;
  return BUDDY_LINES[huntCount - 1] ?? null;
}
