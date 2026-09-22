import { describe, expect, it, vi } from 'vitest';

const { recordAnticheatEventMock } = vi.hoisted(() => ({
  recordAnticheatEventMock: vi.fn(),
}));

vi.mock('../anticheat/audit-logger', () => ({
  recordAnticheatEvent: recordAnticheatEventMock,
}));

import { runMarketAnomalyBatch } from '../anticheat/market-anomaly';
import { runMultiAccountHeuristics } from '../anticheat/multi-account-heuristics';

describe('anticheat market batch', () => {
  it('flags high-risk/self-trade suspicious logs', async () => {
    const prisma = {
      marketSuspiciousLog: {
        findMany: async () => [
          { saleId: 1, listingId: 'l1', sellerId: 'u1', buyerId: 'u1', itemId: 'i1', riskScore: 50 },
          { saleId: 2, listingId: 'l2', sellerId: 'u2', buyerId: 'u3', itemId: 'i2', riskScore: 90 },
        ],
      },
    };
    const count = await runMarketAnomalyBatch(prisma as any);
    expect(count).toBe(2);
    expect(recordAnticheatEventMock).toHaveBeenCalledTimes(2);
  });

  it('flags repeated seller-buyer pairs', async () => {
    const sales = Array.from({ length: 8 }, () => ({ sellerId: 'a', buyerId: 'b' }));
    const prisma = {
      marketSale: {
        findMany: async () => sales,
      },
    };
    const flagged = await runMultiAccountHeuristics(prisma as any);
    expect(flagged).toBe(1);
    expect(recordAnticheatEventMock).toHaveBeenCalled();
  });
});
