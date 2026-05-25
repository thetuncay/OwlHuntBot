// ============================================================
// p2-power-score.test.ts — P2 Fix: refreshPowerScore called conditionally
//
// Unit tests for the conditional refreshPowerScore call in the
// `recordStats` job handler in db-queue.ts.
//
// Key assertions:
//   1. When rareFinds > 0: refreshPowerScore IS called once
//   2. When rareFinds = 0: refreshPowerScore is NOT called
//
// Property 10: Stored powerScore Updated on Every RareFind Change
//   Every increment to totalRareFinds via the recordStats background job
//   must also trigger a refreshPowerScore call in the same job execution.
//
// Validates: Requirements 2.16, 2.17
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock BullMQ ─────────────────────────────────────────────────────────────
// We mock BullMQ so that:
//   - Queue.add rejects immediately → triggers the fallback path in enqueueDbWrite
//     (processFallback → processJob), which is the synchronous-ish code path
//     we can observe in tests.
//   - Worker is a no-op class (we don't want a real worker running).
//
// WHY reject on add: enqueueDbWrite catches the rejection and calls processFallback,
// which calls processJob directly with the Prisma reference. This lets us observe
// the side effects of processJob (i.e., whether refreshPowerScore was called).

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

// ─── Mock leaderboard ─────────────────────────────────────────────────────────
// We spy on refreshPowerScore to assert it is (or is not) called.
// The dynamic import in processJob uses '../systems/leaderboard.js', so we mock
// the module at that path. Vitest resolves .js extensions to .ts in the source.

const refreshPowerScoreMock = vi.fn(async () => 42);

vi.mock('../systems/leaderboard', () => ({
  refreshPowerScore: refreshPowerScoreMock,
  calcPowerScore: vi.fn(() => 42),
  recordHuntStats: vi.fn(async () => undefined),
  recordPvpWin: vi.fn(async () => undefined),
  recordCoinsEarned: vi.fn(async () => undefined),
  updateLeaderboardScore: vi.fn(async () => undefined),
}));

// ─── Mock Redis ───────────────────────────────────────────────────────────────
// The recordStats handler doesn't use Redis directly, but db-queue.ts imports
// redis for the recordPity handler. We provide a minimal mock.

vi.mock('../utils/redis', () => ({
  redis: {
    get: vi.fn(async () => null),
    set: vi.fn(async () => 'OK'),
    del: vi.fn(async () => 1),
    incr: vi.fn(async () => 1),
    incrby: vi.fn(async () => 1),
    expire: vi.fn(async () => 1),
    zadd: vi.fn(async () => 1),
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a minimal Prisma mock for the recordStats handler.
 * The handler calls prisma.player.update to increment totalHunts and totalRareFinds.
 */
function buildPrismaMock() {
  return {
    player: {
      update: vi.fn(async () => ({
        id: 'player-p2-test',
        totalHunts: 1,
        totalRareFinds: 1,
      })),
      findUnique: vi.fn(async () => ({
        id: 'player-p2-test',
        totalHunts: 1,
        powerScore: 42,
      })),
    },
  };
}

/**
 * Wait for all pending microtasks and macrotasks to settle.
 * This is needed because enqueueDbWrite is fire-and-forget:
 * the queue.add rejection and subsequent processFallback call
 * are scheduled as microtasks/promise callbacks.
 */
async function flushAsync(): Promise<void> {
  // Multiple rounds to ensure all chained promises resolve
  for (let i = 0; i < 5; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('P2 Fix — refreshPowerScore called conditionally on rareFinds (Requirements 2.16, 2.17)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset module state between tests so prismaRef and queue are fresh
    vi.resetModules();
    // Re-apply mocks after resetModules
    mockQueueAdd.mockRejectedValue(new Error('mock queue unavailable'));
    refreshPowerScoreMock.mockResolvedValue(42);
  });

  // ── rareFinds > 0: refreshPowerScore MUST be called ──────────────────────

  it(
    'recordStats with rareFinds = 1 calls refreshPowerScore exactly once',
    async () => {
      /**
       * **Validates: Requirements 2.16, 2.17**
       *
       * Property 10: Stored powerScore Updated on Every RareFind Change
       *
       * When the recordStats job has rareFinds > 0, the handler must call
       * refreshPowerScore to update the stored powerScore field on the Player
       * document. This ensures the leaderboard always reflects the current score.
       */
      const { initDbQueue, enqueueDbWrite } = await import('../utils/db-queue');
      const prisma = buildPrismaMock();

      initDbQueue(prisma as unknown as import('@prisma/client').PrismaClient);

      enqueueDbWrite({
        type: 'recordStats',
        playerId: 'player-p2-test',
        hunts: 1,
        rareFinds: 1,
      });

      await flushAsync();

      // refreshPowerScore must have been called exactly once
      expect(refreshPowerScoreMock).toHaveBeenCalledTimes(1);
    },
  );

  it(
    'recordStats with rareFinds = 1 calls refreshPowerScore with correct prisma and playerId',
    async () => {
      /**
       * **Validates: Requirements 2.16, 2.17**
       *
       * Property 10: Stored powerScore Updated on Every RareFind Change
       *
       * The refreshPowerScore call must receive the correct prisma reference
       * and the player's ID so it can read and update the right player document.
       */
      const { initDbQueue, enqueueDbWrite } = await import('../utils/db-queue');
      const prisma = buildPrismaMock();

      initDbQueue(prisma as unknown as import('@prisma/client').PrismaClient);

      enqueueDbWrite({
        type: 'recordStats',
        playerId: 'player-p2-test',
        hunts: 1,
        rareFinds: 1,
      });

      await flushAsync();

      expect(refreshPowerScoreMock).toHaveBeenCalledWith(
        prisma,
        'player-p2-test',
      );
    },
  );

  it(
    'recordStats with rareFinds = 5 calls refreshPowerScore exactly once (not once per find)',
    async () => {
      /**
       * **Validates: Requirements 2.16, 2.17**
       *
       * Property 10: Stored powerScore Updated on Every RareFind Change
       *
       * Even when rareFinds > 1, refreshPowerScore is called exactly once per job
       * (not once per rare find). The power score is refreshed once after the
       * totalRareFinds increment is applied.
       */
      const { initDbQueue, enqueueDbWrite } = await import('../utils/db-queue');
      const prisma = buildPrismaMock();

      initDbQueue(prisma as unknown as import('@prisma/client').PrismaClient);

      enqueueDbWrite({
        type: 'recordStats',
        playerId: 'player-p2-test',
        hunts: 3,
        rareFinds: 5,
      });

      await flushAsync();

      // Called exactly once regardless of rareFinds count
      expect(refreshPowerScoreMock).toHaveBeenCalledTimes(1);
    },
  );

  // ── rareFinds = 0: refreshPowerScore must NOT be called ──────────────────

  it(
    'recordStats with rareFinds = 0 does NOT call refreshPowerScore',
    async () => {
      /**
       * **Validates: Requirements 2.16, 2.17**
       *
       * Property 10: Stored powerScore Updated on Every RareFind Change
       *
       * When rareFinds = 0, no rare find occurred in this job. The power score
       * formula includes totalRareFinds, but since it didn't change, there is no
       * need to refresh the score. The handler must skip the refreshPowerScore call.
       *
       * This also prevents unnecessary DB writes on every hunt (most hunts have
       * rareFinds = 0).
       */
      const { initDbQueue, enqueueDbWrite } = await import('../utils/db-queue');
      const prisma = buildPrismaMock();

      initDbQueue(prisma as unknown as import('@prisma/client').PrismaClient);

      enqueueDbWrite({
        type: 'recordStats',
        playerId: 'player-p2-test',
        hunts: 1,
        rareFinds: 0,
      });

      await flushAsync();

      // refreshPowerScore must NOT be called when rareFinds = 0
      expect(refreshPowerScoreMock).not.toHaveBeenCalled();
    },
  );

  it(
    'recordStats with rareFinds = 0 still calls prisma.player.update for hunts',
    async () => {
      /**
       * **Validates: Requirements 2.16, 2.17**
       *
       * Even when refreshPowerScore is skipped (rareFinds = 0), the handler
       * must still update totalHunts and totalRareFinds via prisma.player.update.
       * The conditional only gates the power score refresh, not the stats update.
       */
      const { initDbQueue, enqueueDbWrite } = await import('../utils/db-queue');
      const prisma = buildPrismaMock();

      initDbQueue(prisma as unknown as import('@prisma/client').PrismaClient);

      enqueueDbWrite({
        type: 'recordStats',
        playerId: 'player-p2-test',
        hunts: 1,
        rareFinds: 0,
      });

      await flushAsync();

      // prisma.player.update must still be called for the stats increment
      expect(prisma.player.update).toHaveBeenCalledWith({
        where: { id: 'player-p2-test' },
        data: {
          totalHunts: { increment: 1 },
          totalRareFinds: { increment: 0 },
        },
      });

      // But refreshPowerScore must NOT be called
      expect(refreshPowerScoreMock).not.toHaveBeenCalled();
    },
  );

  // ── Contrast: both rareFinds=1 and rareFinds=0 in sequence ───────────────

  it(
    'contrast: rareFinds=1 calls refreshPowerScore; rareFinds=0 does not (sequential jobs)',
    async () => {
      /**
       * **Validates: Requirements 2.16, 2.17**
       *
       * Property 10: Stored powerScore Updated on Every RareFind Change
       *
       * This test runs two sequential jobs to confirm the conditional behaviour:
       *   - Job 1: rareFinds = 1 → refreshPowerScore called once
       *   - Job 2: rareFinds = 0 → refreshPowerScore NOT called again
       *
       * Total refreshPowerScore calls after both jobs: exactly 1.
       */
      const { initDbQueue, enqueueDbWrite } = await import('../utils/db-queue');
      const prisma = buildPrismaMock();

      initDbQueue(prisma as unknown as import('@prisma/client').PrismaClient);

      // Job 1: rareFinds = 1 → should call refreshPowerScore
      enqueueDbWrite({
        type: 'recordStats',
        playerId: 'player-p2-test',
        hunts: 1,
        rareFinds: 1,
      });

      await flushAsync();

      expect(refreshPowerScoreMock).toHaveBeenCalledTimes(1);

      // Job 2: rareFinds = 0 → should NOT call refreshPowerScore again
      enqueueDbWrite({
        type: 'recordStats',
        playerId: 'player-p2-test',
        hunts: 1,
        rareFinds: 0,
      });

      await flushAsync();

      // Still only 1 call total (the second job did not trigger it)
      expect(refreshPowerScoreMock).toHaveBeenCalledTimes(1);
    },
  );
});
