import type { PrismaClient } from '@prisma/client';
import { resolvePlayerDisplayName } from './player-display-name';
import {
  normalizeForNameSearch,
  normalizeForNameSearchCompact,
} from './name-search-normalize';

export interface MarketSellerMatch {
  sellerId: string;
  displayName: string;
  score: number;
  listingCount: number;
}

export type MarketSellerResolveResult =
  | { status: 'found'; match: MarketSellerMatch }
  | { status: 'not_found' }
  | { status: 'no_stall'; displayName: string }
  | { status: 'ambiguous'; matches: MarketSellerMatch[] };

function scoreNameMatch(queryNorm: string, queryCompact: string, candidateNorm: string): number {
  const candidateCompact = candidateNorm.replace(/\s/g, '');
  if (!queryNorm || !candidateNorm) return 0;

  if (queryNorm === candidateNorm || queryCompact === candidateCompact) return 100;
  if (candidateNorm.startsWith(queryNorm) || candidateCompact.startsWith(queryCompact)) return 85;
  if (candidateNorm.includes(queryNorm) || candidateCompact.includes(queryCompact)) return 70;

  const tokens = queryNorm.split(' ').filter(Boolean);
  if (tokens.length > 1 && tokens.every((t) => candidateNorm.includes(t))) return 65;
  if (tokens.length === 1 && tokens[0]!.length >= 3 && candidateNorm.split(' ').some((w) => w.startsWith(tokens[0]!))) {
    return 60;
  }

  return 0;
}

function bestScoreForSeller(
  queryNorm: string,
  queryCompact: string,
  labels: string[],
): number {
  return labels.reduce(
    (best, label) => Math.max(best, scoreNameMatch(queryNorm, queryCompact, normalizeForNameSearch(label))),
    0,
  );
}

/** Aktif ilanı olan satıcıları pazar ekranındaki görünen ada göre bulur. */
export async function resolveMarketSellerByQuery(
  prisma: PrismaClient,
  rawQuery: string,
): Promise<MarketSellerResolveResult> {
  const query = rawQuery.trim();
  if (!query) return { status: 'not_found' };

  const queryNorm = normalizeForNameSearch(query);
  const queryCompact = normalizeForNameSearchCompact(query);
  if (!queryNorm) return { status: 'not_found' };

  const activeSellers = await prisma.marketListing.groupBy({
    by: ['sellerId'],
    where: { status: 'active' },
    _count: { sellerId: true },
  });
  if (activeSellers.length === 0) return { status: 'not_found' };

  const sellerIds = activeSellers.map((s) => s.sellerId);
  const listingCounts = new Map(activeSellers.map((s) => [s.sellerId, s._count.sellerId]));

  const players = await prisma.player.findMany({
    where: { id: { in: sellerIds } },
    select: {
      id: true,
      leaderboardName: true,
      registrations: { select: { displayName: true, username: true }, take: 1 },
    },
  });

  const scored: MarketSellerMatch[] = [];

  for (const player of players) {
    const displayName = resolvePlayerDisplayName(player);
    const labels = [
      displayName,
      player.registrations[0]?.displayName,
      player.registrations[0]?.username,
    ].filter((v): v is string => Boolean(v?.trim()));

    const score = bestScoreForSeller(queryNorm, queryCompact, labels);
    if (score >= 55) {
      scored.push({
        sellerId: player.id,
        displayName,
        score,
        listingCount: listingCounts.get(player.id) ?? 0,
      });
    }
  }

  if (scored.length === 0) {
    const maybePlayer = await prisma.player.findFirst({
      where: {
        OR: [
          { leaderboardName: { contains: query, mode: 'insensitive' } },
          { registrations: { some: { username: { contains: query, mode: 'insensitive' } } } },
        ],
      },
      select: {
        id: true,
        leaderboardName: true,
        registrations: { select: { displayName: true, username: true }, take: 1 },
      },
    });
    if (maybePlayer && !sellerIds.includes(maybePlayer.id)) {
      return { status: 'no_stall', displayName: resolvePlayerDisplayName(maybePlayer) };
    }
    return { status: 'not_found' };
  }

  scored.sort((a, b) => b.score - a.score || b.listingCount - a.listingCount);
  const topScore = scored[0]!.score;
  const top = scored.filter((s) => s.score === topScore);

  if (top.length > 1) {
    return { status: 'ambiguous', matches: top.slice(0, 5) };
  }

  return { status: 'found', match: top[0]! };
}
