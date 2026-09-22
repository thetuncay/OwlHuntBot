/**
 * hunt-session-streak.ts — Geriye dönük uyumluluk.
 *
 * Av serisi artık `hunt-milestones` altında birleşik.
 * Bu dosya eski import yollarını korur; yeni kod milestones kullanmalı.
 */

import {
  applyHuntSeriesXp,
  huntSeriesXpMult,
} from './hunt-milestones';
import {
  HUNT_MILESTONE_FIRST_TARGET,
  HUNT_MILESTONE_SECOND_TARGET,
  HUNT_SERIES_XP_MULT_25,
  HUNT_SERIES_XP_MULT_50,
} from '../config/hunt-milestones';

/** @deprecated Av serisi birleşti — boş döner (UI yalnızca blokta). */
export interface HuntSessionStreak {
  count: number;
  bonusActive: boolean;
}

/** @deprecated `huntSeriesXpMult` kullan. */
export function sessionHuntXpMult(count: number): number {
  return huntSeriesXpMult(count);
}

/** @deprecated Session Redis sayacı kaldırıldı — no-op stub. */
export async function tickHuntSessionStreak(
  _redis: unknown,
  _userId: string,
): Promise<HuntSessionStreak> {
  return { count: 0, bonusActive: false };
}

/** @deprecated `applyHuntSeriesXp` kullan. */
export function applySessionStreakXp(xp: number, count: number): number {
  return applyHuntSeriesXp(xp, count);
}

/**
 * @deprecated Av serisi satırı hunt bloğunda; ekstra satır yok.
 */
export function formatSessionStreakLines(_streak: HuntSessionStreak): string[] {
  return [];
}

export const _legacySessionThresholds = {
  m25: HUNT_MILESTONE_FIRST_TARGET,
  m50: HUNT_MILESTONE_SECOND_TARGET,
  mult25: HUNT_SERIES_XP_MULT_25,
  mult50: HUNT_SERIES_XP_MULT_50,
} as const;
