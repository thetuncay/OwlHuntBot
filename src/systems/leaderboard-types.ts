/**
 * leaderboard-types.ts — Paylaşılan tipler
 */

export type LeaderboardCategory = 'power' | 'hunt' | 'arena' | 'wealth';

export type LeaderboardScopeMode = 'global' | 'guild';

export type LeaderboardPeriodMode = 'season' | 'week' | 'month' | 'alltime';

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  displayName: string;
  score: number;
  level: number;
  detail: string;
}

export interface LeaderboardResult {
  category: LeaderboardCategory;
  seasonId: string;
  scope: LeaderboardScopeMode;
  period: LeaderboardPeriodMode;
  scopeLabel: string;
  entries: LeaderboardEntry[];
  viewerRank: number;
  viewerContext: LeaderboardEntry[];
  updatedAt: Date;
}

export interface RankChangeResult {
  oldRank: number;
  newRank: number;
  delta: number;
  category: LeaderboardCategory;
}

export interface GetLeaderboardOptions {
  viewerId?: string;
  scope?: LeaderboardScopeMode;
  guildId?: string | null;
  period?: LeaderboardPeriodMode;
  /** Skip Redis snapshot cache and rebuild from ZSET (command/page load). */
  fresh?: boolean;
}
