/**
 * hunt-flavor.ts — Garanti XP tabanı + (devre dışı) saat/micro-event stub.
 *
 * Micro-event / sabah-gece aroma satırları kaldırıldı — UI gürültüsü yok.
 */

import type { Redis } from 'ioredis';
import {
  HUNT_GUARANTEE_XP_FLOOR,
  HUNT_ISTANBUL_UTC_OFFSET_HOURS,
} from '../config/hunt-flavor';

export type HuntTimeWindow = 'morning' | 'night' | 'day';

export interface HuntTimeBonus {
  window: HuntTimeWindow;
  xpMult: number;
  rareBonus: number;
  line: string | null;
}

/**
 * İstanbul yerel saatini döner (sabit +3, DST yok — şeffaf).
 *
 * @param now UTC an
 */
export function istanbulHour(now: Date): number {
  return (now.getUTCHours() + HUNT_ISTANBUL_UTC_OFFSET_HOURS + 24) % 24;
}

/**
 * Saat penceresi — aroma satırı ve bonus yok (nötr).
 */
export function resolveHuntTimeBonus(_now = new Date()): HuntTimeBonus {
  return { window: 'day', xpMult: 1, rareBonus: 0, line: null };
}

/**
 * Saat XP çarpanını uygular.
 *
 * @param xp Ham XP
 * @param xpMult Çarpan
 */
export function applyTimeOfDayXp(xp: number, xpMult: number): number {
  if (xp <= 0 || xpMult === 1) return xp;
  return Math.round(xp * xpMult);
}

/**
 * Garanti av XP tabanı (D1).
 *
 * @param preyXp Avın kendi XP'si
 */
export function guaranteePreyXp(preyXp: number): number {
  return Math.max(preyXp, HUNT_GUARANTEE_XP_FLOOR);
}

export interface MicroEventResult {
  triggered: boolean;
  bonusXp: number;
  line: string | null;
}

/**
 * Micro-event aroma kaldırıldı — her zaman no-op.
 */
export async function tickHuntMicroEvent(
  _redis: Redis,
  _userId: string,
): Promise<MicroEventResult> {
  return { triggered: false, bonusXp: 0, line: null };
}
