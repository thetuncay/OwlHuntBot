import type { PrismaClient } from '@prisma/client';
import { recordAnticheatEvent } from './audit-logger';

/**
 * MarketSale + MarketSuspiciousLog üzerinden günlük anomali snapshot üretir.
 * Observe-only: ceza uygulamaz, sadece event üretir.
 */
export async function runMarketAnomalyBatch(prisma: PrismaClient): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const suspicious = await prisma.marketSuspiciousLog.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { riskScore: 'desc' },
    take: 500,
  });
  if (suspicious.length === 0) return 0;

  for (const row of suspicious) {
    const selfTrade = row.sellerId === row.buyerId;
    const highRisk = row.riskScore >= 80;
    if (!selfTrade && !highRisk) continue;

    recordAnticheatEvent({
      userId: row.sellerId,
      eventType: 'multi_account_flag',
      severity: highRisk ? 4 : 3,
      detail: {
        source: 'market_anomaly_batch',
        saleId: row.saleId,
        listingId: row.listingId,
        sellerId: row.sellerId,
        buyerId: row.buyerId,
        itemId: row.itemId,
        riskScore: row.riskScore,
        selfTrade,
      },
    });
  }

  return suspicious.length;
}
