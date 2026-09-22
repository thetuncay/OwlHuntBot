// recordStats job → recordHuntStats delegation tests

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockQueueAdd = vi.fn().mockRejectedValue(new Error('mock queue unavailable'));

vi.mock('bullmq', () => {
  class MockQueue {
    add = mockQueueAdd;
    close = vi.fn(async () => undefined);
  }
  class MockWorker {
    on = vi.fn();
    close = vi.fn(async () => undefined);
  }
  return { Queue: MockQueue, Worker: MockWorker };
});

const recordHuntStatsMock = vi.fn(async () => undefined);

vi.mock('../systems/leaderboard', () => ({
  recordHuntStats: recordHuntStatsMock,
}));

vi.mock('../utils/redis', () => ({
  redis: {
    pipeline: vi.fn(() => ({ zadd: vi.fn(), exec: vi.fn(async () => []) })),
  },
}));

async function flushAsync(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

describe('recordStats job delegates to recordHuntStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockQueueAdd.mockRejectedValue(new Error('mock queue unavailable'));
  });

  it('calls recordHuntStats with hunts, rareFinds, guildId', async () => {
    const { initDbQueue, enqueueDbWrite } = await import('../utils/db-queue');
    const prisma = { player: { update: vi.fn() } };

    initDbQueue(prisma as unknown as import('@prisma/client').PrismaClient);

    enqueueDbWrite({
      type: 'recordStats',
      playerId: 'p1',
      hunts: 2,
      rareFinds: 1,
      guildId: 'g1',
    });

    await flushAsync();

    expect(recordHuntStatsMock).toHaveBeenCalledWith(
      prisma,
      expect.anything(),
      'p1',
      2,
      1,
      'g1',
    );
  });

  it('calls recordHuntStats when rareFinds is 0', async () => {
    const { initDbQueue, enqueueDbWrite } = await import('../utils/db-queue');
    const prisma = { player: { update: vi.fn() } };

    initDbQueue(prisma as unknown as import('@prisma/client').PrismaClient);

    enqueueDbWrite({
      type: 'recordStats',
      playerId: 'p1',
      hunts: 1,
      rareFinds: 0,
    });

    await flushAsync();

    expect(recordHuntStatsMock).toHaveBeenCalledTimes(1);
  });
});
