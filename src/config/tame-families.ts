/**
 * Tame / encounter aile sayaçları (B4).
 *
 * Kişilik (aggressive/timid/…) zaten var. Bu tablo türe göre
 * ikinci bir karşı-hamle katmanı ekler — tek dominant strateji olmasın.
 * Bonus görünür: ipucu satırı oyuncuya hangi eylemin işe yaradığını söyler.
 */

import type { TameAction } from '../utils/tame-narrative';

export type OwlFamily = 'fish' | 'snow' | 'horn' | 'forest' | 'barn' | 'small' | 'night';

/** Aile eşleşince eyleme eklenen tame roll bonusu. */
export const OWL_FAMILY_ACTION_BONUS = 8;

export const OWL_FAMILY_BY_SPECIES: Readonly<Record<string, OwlFamily>> = {
  'Blakiston balik baykusu': 'fish',
  'Puhu baykusu': 'night',
  'Kar baykusu': 'snow',
  'Boynuzlu baykus': 'horn',
  'Buyuk boz baykus': 'forest',
  'Ural baykusu': 'forest',
  'Peceli baykus': 'barn',
  'Kukumav baykusu': 'small',
};

export const OWL_FAMILY_PREFERRED_ACTION: Readonly<Record<OwlFamily, TameAction>> = {
  fish: 'advance',
  snow: 'silent',
  horn: 'distract',
  forest: 'silent',
  barn: 'distract',
  small: 'advance',
  night: 'silent',
};

export const OWL_FAMILY_LABEL: Readonly<Record<OwlFamily, string>> = {
  fish: 'Balıkçı',
  snow: 'Kar',
  horn: 'Boynuzlu',
  forest: 'Orman',
  barn: 'Ambar',
  small: 'Cüce',
  night: 'Gece',
};

export const OWL_FAMILY_HINT: Readonly<Record<OwlFamily, string>> = {
  fish: 'Balıkçı tür — kararlı yaklaşım (İlerle) işe yarar.',
  snow: 'Kar türü — yavaş ve sessiz yaklaş.',
  horn: 'Boynuzlu — dikkatini dağıt, doğrudan bakma.',
  forest: 'Orman türü — sessiz kal, iz bırakma.',
  barn: 'Ambar türü — şaşırt, rutiğini boz.',
  small: 'Cüce tür — cesur ilerle, ürkütme.',
  night: 'Gece türü — sessiz yaklaşım işe yarar.',
};

export const TAME_ACTION_LABEL: Readonly<Record<TameAction, string>> = {
  silent: 'Sessiz',
  distract: 'Şaşırt',
  advance: 'İlerle',
};
