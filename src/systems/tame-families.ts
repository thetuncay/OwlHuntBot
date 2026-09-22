/**
 * tame-families.ts — Tür ailesi karşı-hamle (B4).
 */

import {
  OWL_FAMILY_ACTION_BONUS,
  OWL_FAMILY_BY_SPECIES,
  OWL_FAMILY_HINT,
  OWL_FAMILY_LABEL,
  OWL_FAMILY_PREFERRED_ACTION,
  TAME_ACTION_LABEL,
  type OwlFamily,
} from '../config/tame-families';
import type { TameAction } from '../utils/tame-narrative';

/**
 * Tür adından aile.
 *
 * @param species Baykuş türü
 */
export function resolveOwlFamily(species: string): OwlFamily {
  return OWL_FAMILY_BY_SPECIES[species] ?? 'forest';
}

/**
 * Aile için tercih edilen eylem.
 *
 * @param family Aile
 */
export function preferredTameAction(family: OwlFamily): TameAction {
  return OWL_FAMILY_PREFERRED_ACTION[family];
}

/**
 * Eylem aileyle eşleşirse bonus.
 *
 * @param family Aile
 * @param action Seçilen eylem
 */
export function familyActionBonus(family: OwlFamily, action: TameAction): number {
  return preferredTameAction(family) === action ? OWL_FAMILY_ACTION_BONUS : 0;
}

/**
 * Encounter / tame ipucu — çözülebilir, kısa.
 *
 * @param species Baykuş türü
 */
export function formatFamilyHint(species: string): string {
  const family = resolveOwlFamily(species);
  return `${OWL_FAMILY_LABEL[family]} · ${OWL_FAMILY_HINT[family]}`;
}

/**
 * Tercih edilen eylem etiketi (test / UI).
 *
 * @param species Baykuş türü
 */
export function preferredActionLabel(species: string): string {
  const action = preferredTameAction(resolveOwlFamily(species));
  return TAME_ACTION_LABEL[action];
}
