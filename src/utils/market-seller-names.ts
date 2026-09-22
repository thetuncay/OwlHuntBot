import type { PrismaClient } from '@prisma/client';
import { resolvePlayerDisplayName } from './player-display-name';

/** Aktif ilan satıcılarının görünen adları. */
export async function fetchSellerDisplayNames(
  prisma: PrismaClient,
  sellerIds: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(sellerIds.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const players = await prisma.player.findMany({
    where: { id: { in: unique } },
    select: {
      id: true,
      leaderboardName: true,
      registrations: { select: { displayName: true, username: true }, take: 1 },
    },
  });

  return new Map(
    players.map((p) => [p.id, resolvePlayerDisplayName(p)]),
  );
}

export function resolveSellerLabel(
  sellerNames: Map<string, string>,
  sellerId: string,
): string {
  return sellerNames.get(sellerId) ?? 'Bir avcı';
}
