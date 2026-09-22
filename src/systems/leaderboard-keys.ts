/**
 * leaderboard-keys.ts — Redis key şeması (scope × category × period)
 */
import { SEASON_TYPE } from '../config';
import type { LeaderboardCategory } from './leaderboard-types';

export const GLOBAL_SCOPE = 'global';

export function guildScopeId(guildId: string): string {
  return `g:${guildId}`;
}

export function currentMonthId(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** ISO hafta — leaderboard-season ile uyumlu */
export function currentWeekId(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function currentSeasonPeriodId(now = new Date()): string {
  if (SEASON_TYPE === 'monthly') return currentMonthId(now);
  return currentWeekId(now);
}

export const ALLTIME_PERIOD = 'all';

export interface ActivePeriods {
  season: string;
  week: string;
  month: string;
  alltime: typeof ALLTIME_PERIOD;
}

export function activePeriods(now = new Date()): ActivePeriods {
  return {
    season: currentSeasonPeriodId(now),
    week: currentWeekId(now),
    month: currentMonthId(now),
    alltime: ALLTIME_PERIOD,
  };
}

export function zsetKey(scopeId: string, category: LeaderboardCategory, period: string): string {
  return `lb:z:${scopeId}:${category}:${period}`;
}

/** Legacy key (migration / cleanup) */
export function legacyZsetKey(category: LeaderboardCategory): string {
  return `lb:${category}`;
}

export function snapshotKey(
  scopeId: string,
  category: LeaderboardCategory,
  period: string,
  topN: number,
): string {
  return `lb:s:${scopeId}:${category}:${period}:t${topN}`;
}

/** Eski sezon JSON cache (temizlik için) */
export function legacySeasonSnapshotKey(category: LeaderboardCategory, seasonId: string): string {
  return `lb:${category}:${seasonId}`;
}

export function refreshLockKey(snapshotKeyStr: string): string {
  return `lb:lock:${snapshotKeyStr}`;
}

export const ALL_CATEGORIES: LeaderboardCategory[] = ['power', 'hunt', 'arena', 'wealth'];

export function allPeriodKeys(scopeId: string, category: LeaderboardCategory, now = new Date()): string[] {
  const p = activePeriods(now);
  return [
    zsetKey(scopeId, category, p.season),
    zsetKey(scopeId, category, p.week),
    zsetKey(scopeId, category, p.month),
    zsetKey(scopeId, category, p.alltime),
  ];
}

export function allSnapshotKeysForCategory(
  scopeId: string,
  category: LeaderboardCategory,
  period: string,
  topNs: number[],
): string[] {
  return topNs.map((n) => snapshotKey(scopeId, category, period, n));
}

export function dailyCapKey(category: LeaderboardCategory, playerId: string, date = new Date()): string {
  const d = date.toISOString().slice(0, 10);
  return `lb:cap:${category}:${playerId}:${d}`;
}
