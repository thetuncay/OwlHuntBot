/**
 * Public leaderboard JSON for the marketing site (no secrets).
 */
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { getLeaderboard } from '../systems/leaderboard';
import type { LeaderboardCategory } from '../systems/leaderboard-types';
import { categoryFromString } from '../utils/leaderboard-ux';

const DEFAULT_CATEGORY: LeaderboardCategory = 'power';
const PUBLIC_TOP_N = 10;

export interface PublicLeaderboardEntry {
  rank: number;
  playerId: string;
  displayName: string;
  score: number;
  detail: string;
  isViewer?: boolean;
}

export interface PublicLeaderboardPayload {
  category: LeaderboardCategory;
  seasonId: string;
  scopeLabel: string;
  updatedAt: string;
  entries: PublicLeaderboardEntry[];
  viewerId: string | null;
  viewerRank: number;
  viewerEntry: PublicLeaderboardEntry | null;
}

export async function resolvePublicLeaderboard(
  prisma: PrismaClient,
  redis: Redis,
  categoryParam?: string | null,
  viewerId?: string | null,
): Promise<PublicLeaderboardPayload> {
  const cat = (categoryParam ? categoryFromString(categoryParam) : null) ?? DEFAULT_CATEGORY;
  const result = await getLeaderboard(prisma, redis, cat, {
    fresh: true,
    viewerId: viewerId ?? undefined,
  });

  const top = result.entries.slice(0, PUBLIC_TOP_N);
  const viewerInTop = viewerId ? top.some((e) => e.playerId === viewerId) : false;

  const entries: PublicLeaderboardEntry[] = top.map((e) => ({
    rank: e.rank,
    playerId: e.playerId,
    displayName: e.displayName || 'Oyuncu',
    score: e.score,
    detail: e.detail,
    isViewer: viewerId ? e.playerId === viewerId : false,
  }));

  let viewerEntry: PublicLeaderboardEntry | null = null;
  if (viewerId && result.viewerRank > 0 && !viewerInTop) {
    const self = result.viewerContext.find((e) => e.playerId === viewerId);
    if (self) {
      viewerEntry = {
        rank: self.rank,
        playerId: self.playerId,
        displayName: self.displayName || 'Oyuncu',
        score: self.score,
        detail: self.detail,
        isViewer: true,
      };
    }
  }

  return {
    category: result.category,
    seasonId: result.seasonId,
    scopeLabel: result.scopeLabel,
    updatedAt: result.updatedAt.toISOString(),
    entries,
    viewerId: viewerId ?? null,
    viewerRank: viewerId ? result.viewerRank : -1,
    viewerEntry,
  };
}
