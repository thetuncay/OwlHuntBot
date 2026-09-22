import type { PrismaClient } from '@prisma/client';
import { recordAnticheatEvent } from './audit-logger';

/**
 * IP olmadan davranışsal çoklu-hesap heuristics.
 * Aynı satıcı-alıcı çifti arasında kısa sürede yoğun işlem varsa flag üretir.
 */
export async function runMultiAccountHeuristics(prisma: PrismaClient): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const sales = await prisma.marketSale.findMany({
    where: { soldAt: { gte: since } },
    select: { sellerId: true, buyerId: true },
    take: 5000,
  });
  if (sales.length === 0) return 0;

  const pairCounts = new Map<string, { sellerId: string; buyerId: string; count: number }>();
  for (const s of sales) {
    const key = `${s.sellerId}:${s.buyerId}`;
    const prev = pairCounts.get(key);
    if (prev) {
      prev.count += 1;
    } else {
      pairCounts.set(key, { sellerId: s.sellerId, buyerId: s.buyerId, count: 1 });
    }
  }

  let flagged = 0;
  for (const pair of pairCounts.values()) {
    if (pair.count < 8) continue;
    flagged += 1;
    recordAnticheatEvent({
      userId: pair.sellerId,
      eventType: 'multi_account_flag',
      severity: 3,
      detail: {
        source: 'multi_account_heuristics',
        sellerId: pair.sellerId,
        buyerId: pair.buyerId,
        pairTrades24h: pair.count,
      },
    });
  }

  return flagged;
}
