// ============================================================
// p1-db-ops.test.ts — P1 Fix Verification
//
// Verifies that lootbox.ts uses enqueueDbWrite (BullMQ background job)
// instead of synchronous redis.incr/redis.del for pity counter writes.
//
// Key assertions:
//   1. enqueueDbWrite is called with { type: 'recordPity', ... }
//   2. redis.incr / redis.incrby / redis.del are NOT called directly
//      from the lootbox open flow (pity writes are deferred)
//
// Property 8: Hunt Response Path Has ≤ 3 Synchronous DB Operations
//   The lootbox open flow must not add synchronous Redis pity writes
//   to the response path — they must be enqueued as background jobs.
//
// Validates: Requirements 2.13, 2.14
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock db-queue (capture enqueueDbWrite calls) ────────────────────────────

// We capture calls to enqueueDbWrite so we can assert on them.
// The actual BullMQ queue is not initialised in tests.
const enqueueDbWriteMock = vi.fn();

vi.mock('../utils/db-queue', () => ({
  enqueueDbWrite: enqueueDbWriteMock,
  enqueueDbWriteBulk: vi.fn(),
}));

// ─── Mock Redis ───────────────────────────────────────────────────────────────
// Minimal Redis mock:
//   - get: returns null (pity count = 0, no pity triggered)
//   - set/del/incr/incrby: tracked so we can assert they are NOT called
//     for pity writes from the lootbox flow

const redisMock = {
  get:    vi.fn(async (_key: string) => null),
  set:    vi.fn(async () => 'OK'),
  del:    vi.fn(async () => 1),
  incr:   vi.fn(async () => 1),
  incrby: vi.fn(async () => 1),
  expire: vi.fn(async () => 1),
  eval:   vi.fn(async (_script: string, _numKeys: number, key: string, token: string) => {
    // Simulate successful lock release
    return 1;
  }),
};

vi.mock('../utils/redis', () => ({
  redis: redisMock,
}));

// ─── Mock lock (pass-through) ─────────────────────────────────────────────────
// withLock must execute the callback — we mock it to run fn() directly
// without touching Redis for the lock key itself.

vi.mock('../utils/lock', () => ({
  withLock: vi.fn(async (_playerId: string, _action: string, fn: () => Promise<unknown>) => {
    return fn();
  }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a minimal Prisma mock for the lootbox open flow.
 *
 * The lootbox flow needs:
 *   - inventoryItem.findUnique: returns a lootbox item with quantity >= 1
 *   - inventoryItem.delete / inventoryItem.update: consume the lootbox
 *   - inventoryItem.upsert: add the dropped buff item to inventory
 *   - $transaction: execute the callback inline
 *
 * We track how many times prisma operations are called so we can
 * assert on the synchronous DB operation count.
 */
function buildPrismaMock(lootboxQuantity = 2) {
  const syncDbOpCount = { value: 0 };

  const tx = {
    inventoryItem: {
      delete: vi.fn(async () => {
        syncDbOpCount.value++;
        return {};
      }),
      update: vi.fn(async () => {
        syncDbOpCount.value++;
        return {};
      }),
      upsert: vi.fn(async () => {
        syncDbOpCount.value++;
        return {};
      }),
    },
  };

  const prisma = {
    inventoryItem: {
      findUnique: vi.fn(async () => ({
        ownerId:  'player-p1-test',
        itemName: 'Silah Kutusu',
        itemType: 'Lootbox',
        rarity:   'Common',
        quantity: lootboxQuantity,
      })),
    },
    $transaction: vi.fn(async (fn: (tx: typeof tx) => Promise<unknown>) => {
      return fn(tx);
    }),
    _syncDbOpCount: syncDbOpCount,
    _tx: tx,
  };

  return { prisma, syncDbOpCount, tx };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('P1 Fix — Pity writes deferred to BullMQ (Requirements 2.13, 2.14)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Core assertion: enqueueDbWrite called with type: 'recordPity' ─────────

  it(
    'openLootbox calls enqueueDbWrite with { type: "recordPity" } after opening a lootbox',
    async () => {
      /**
       * **Validates: Requirements 2.13, 2.14**
       *
       * Property 8: Hunt Response Path Has ≤ 3 Synchronous DB Operations
       *
       * The pity counter update must be enqueued as a background BullMQ job,
       * not written synchronously. This test confirms enqueueDbWrite is called
       * with the correct job type after a lootbox is opened.
       */
      const { prisma } = buildPrismaMock();
      const { openLootbox } = await import('../systems/lootbox');

      await openLootbox(
        prisma as unknown as import('@prisma/client').PrismaClient,
        redisMock as unknown as import('ioredis').default,
        'player-p1-test',
        'wc',
      );

      // enqueueDbWrite must have been called at least once
      expect(enqueueDbWriteMock).toHaveBeenCalled();

      // At least one call must be for recordPity
      const pityCall = enqueueDbWriteMock.mock.calls.find(
        (call) => call[0]?.type === 'recordPity',
      );
      expect(pityCall).toBeDefined();
    },
  );

  it(
    'enqueueDbWrite recordPity job contains correct playerId and lootboxId',
    async () => {
      /**
       * **Validates: Requirements 2.13, 2.14**
       *
       * The enqueued job must reference the correct player and lootbox so the
       * background worker can update the right pity counter.
       */
      const { prisma } = buildPrismaMock();
      const { openLootbox } = await import('../systems/lootbox');

      await openLootbox(
        prisma as unknown as import('@prisma/client').PrismaClient,
        redisMock as unknown as import('ioredis').default,
        'player-p1-test',
        'wc',
      );

      const pityCall = enqueueDbWriteMock.mock.calls.find(
        (call) => call[0]?.type === 'recordPity',
      );
      expect(pityCall).toBeDefined();

      const job = pityCall![0];
      expect(job.playerId).toBe('player-p1-test');
      expect(job.lootboxId).toBe('wc');
    },
  );

  it(
    'enqueueDbWrite recordPity job has increment=1 and reset=false for a non-pity open',
    async () => {
      /**
       * **Validates: Requirements 2.13, 2.14**
       *
       * When no pity is triggered (pity count = 0, below threshold),
       * the job must increment the counter by 1 and not reset it.
       */
      const { prisma } = buildPrismaMock();
      const { openLootbox } = await import('../systems/lootbox');

      // redis.get returns null → pityCount = 0 → no pity triggered
      redisMock.get.mockResolvedValue(null);

      // Force a Common drop (no pity) by making Math.random return a value
      // that selects Common (highest weight = 60/100 = first bucket)
      vi.spyOn(Math, 'random').mockReturnValue(0.01);

      await openLootbox(
        prisma as unknown as import('@prisma/client').PrismaClient,
        redisMock as unknown as import('ioredis').default,
        'player-p1-test',
        'wc',
      );

      const pityCall = enqueueDbWriteMock.mock.calls.find(
        (call) => call[0]?.type === 'recordPity',
      );
      expect(pityCall).toBeDefined();

      const job = pityCall![0];
      // Non-pity open: increment counter by 1, do not reset
      expect(job.increment).toBe(1);
      expect(job.reset).toBe(false);
    },
  );

  it(
    'enqueueDbWrite recordPity job has reset=true when pity is triggered',
    async () => {
      /**
       * **Validates: Requirements 2.13, 2.14**
       *
       * When pity is triggered (pity count >= pityThreshold),
       * the job must reset the counter (reset=true, increment=0).
       */
      const { prisma } = buildPrismaMock();
      const { openLootbox } = await import('../systems/lootbox');

      // Simulate pity threshold reached: wc pityThreshold = 6
      redisMock.get.mockResolvedValue('6');

      await openLootbox(
        prisma as unknown as import('@prisma/client').PrismaClient,
        redisMock as unknown as import('ioredis').default,
        'player-p1-test',
        'wc',
      );

      const pityCall = enqueueDbWriteMock.mock.calls.find(
        (call) => call[0]?.type === 'recordPity',
      );
      expect(pityCall).toBeDefined();

      const job = pityCall![0];
      // Pity triggered: reset the counter
      expect(job.reset).toBe(true);
      expect(job.increment).toBe(0);
    },
  );

  // ── Core assertion: synchronous redis.incr/del NOT called for pity ────────

  it(
    'redis.incr is NOT called directly during lootbox open (pity write is deferred)',
    async () => {
      /**
       * **Validates: Requirements 2.13, 2.14**
       *
       * Property 8: Hunt Response Path Has ≤ 3 Synchronous DB Operations
       *
       * The old synchronous pity write used redis.incr(pityKey) directly.
       * After the P1 fix, this must NOT happen — the write is deferred to BullMQ.
       *
       * Note: redis.get IS allowed (reading the current pity count to decide
       * whether pity is triggered is a read, not a write).
       */
      const { prisma } = buildPrismaMock();
      const { openLootbox } = await import('../systems/lootbox');

      redisMock.get.mockResolvedValue(null);

      await openLootbox(
        prisma as unknown as import('@prisma/client').PrismaClient,
        redisMock as unknown as import('ioredis').default,
        'player-p1-test',
        'wc',
      );

      // redis.incr must NOT be called (pity write is deferred)
      expect(redisMock.incr).not.toHaveBeenCalled();
    },
  );

  it(
    'redis.incrby is NOT called directly during lootbox open (pity write is deferred)',
    async () => {
      /**
       * **Validates: Requirements 2.13, 2.14**
       *
       * Same as above but for redis.incrby — the alternative synchronous
       * pity increment method.
       */
      const { prisma } = buildPrismaMock();
      const { openLootbox } = await import('../systems/lootbox');

      redisMock.get.mockResolvedValue(null);

      await openLootbox(
        prisma as unknown as import('@prisma/client').PrismaClient,
        redisMock as unknown as import('ioredis').default,
        'player-p1-test',
        'wc',
      );

      // redis.incrby must NOT be called (pity write is deferred)
      expect(redisMock.incrby).not.toHaveBeenCalled();
    },
  );

  it(
    'redis.del is NOT called directly during lootbox open (pity reset is deferred)',
    async () => {
      /**
       * **Validates: Requirements 2.13, 2.14**
       *
       * The old synchronous pity reset used redis.del(pityKey) directly.
       * After the P1 fix, this must NOT happen — the reset is deferred to BullMQ.
       *
       * We trigger pity (count >= threshold) to exercise the reset path.
       */
      const { prisma } = buildPrismaMock();
      const { openLootbox } = await import('../systems/lootbox');

      // Trigger pity: wc pityThreshold = 6
      redisMock.get.mockResolvedValue('6');

      await openLootbox(
        prisma as unknown as import('@prisma/client').PrismaClient,
        redisMock as unknown as import('ioredis').default,
        'player-p1-test',
        'wc',
      );

      // redis.del must NOT be called (pity reset is deferred)
      expect(redisMock.del).not.toHaveBeenCalled();
    },
  );

  // ── Synchronous DB operation count ───────────────────────────────────────

  it(
    'lootbox open performs ≤ 3 synchronous DB write operations (inventory only)',
    async () => {
      /**
       * **Validates: Requirements 2.13, 2.14**
       *
       * Property 8: Hunt Response Path Has ≤ 3 Synchronous DB Operations
       *
       * The lootbox open flow must only perform synchronous DB writes for:
       *   1. Consume the lootbox (inventoryItem.update or .delete)
       *   2. Award the buff item (inventoryItem.upsert)
       *
       * Pity writes must NOT be synchronous — they are enqueued as BullMQ jobs.
       * Total synchronous DB writes must be ≤ 3.
       */
      const { prisma, syncDbOpCount } = buildPrismaMock(2);
      const { openLootbox } = await import('../systems/lootbox');

      redisMock.get.mockResolvedValue(null);

      await openLootbox(
        prisma as unknown as import('@prisma/client').PrismaClient,
        redisMock as unknown as import('ioredis').default,
        'player-p1-test',
        'wc',
      );

      // At most 3 synchronous DB writes:
      //   1. inventoryItem.update (decrement lootbox quantity) or .delete
      //   2. inventoryItem.upsert (add buff item to inventory)
      // Pity writes are deferred → not counted here
      expect(syncDbOpCount.value).toBeLessThanOrEqual(3);
    },
  );

  // ── ec (Eşya Kutusu) variant ──────────────────────────────────────────────

  it(
    'openLootbox for ec (Eşya Kutusu) also enqueues recordPity and skips synchronous pity writes',
    async () => {
      /**
       * **Validates: Requirements 2.13, 2.14**
       *
       * The fix must apply to both lootbox types (wc and ec).
       */
      const { prisma } = buildPrismaMock(3);

      // Override findUnique to return an ec lootbox
      prisma.inventoryItem.findUnique = vi.fn(async () => ({
        ownerId:  'player-p1-test',
        itemName: 'Eşya Kutusu',
        itemType: 'Lootbox',
        rarity:   'Common',
        quantity: 3,
      }));

      const { openLootbox } = await import('../systems/lootbox');

      redisMock.get.mockResolvedValue(null);

      await openLootbox(
        prisma as unknown as import('@prisma/client').PrismaClient,
        redisMock as unknown as import('ioredis').default,
        'player-p1-test',
        'ec',
      );

      // enqueueDbWrite must be called with recordPity for ec
      const pityCall = enqueueDbWriteMock.mock.calls.find(
        (call) => call[0]?.type === 'recordPity',
      );
      expect(pityCall).toBeDefined();
      expect(pityCall![0].lootboxId).toBe('ec');

      // No synchronous pity writes
      expect(redisMock.incr).not.toHaveBeenCalled();
      expect(redisMock.incrby).not.toHaveBeenCalled();
      expect(redisMock.del).not.toHaveBeenCalled();
    },
  );

  // ── Rare+ drop also resets pity via enqueueDbWrite ────────────────────────

  it(
    'a Rare+ drop (non-pity-triggered) also enqueues recordPity with reset=true',
    async () => {
      /**
       * **Validates: Requirements 2.13, 2.14**
       *
       * When a Rare or better item drops naturally (not via pity trigger),
       * the pity counter must still be reset — via enqueueDbWrite, not synchronously.
       */
      const { prisma } = buildPrismaMock();
      const { openLootbox } = await import('../systems/lootbox');

      // pity count = 0 (no pity trigger)
      redisMock.get.mockResolvedValue(null);

      // Force a Rare drop: Math.random = 0.65 puts us in the Rare weight bucket
      // wc weights: Common=60, Rare=30, Epic=9, Legendary=1 (total=100)
      // cursor = 0.65 * 100 = 65 → after Common (60) → Rare bucket
      vi.spyOn(Math, 'random').mockReturnValue(0.65);

      await openLootbox(
        prisma as unknown as import('@prisma/client').PrismaClient,
        redisMock as unknown as import('ioredis').default,
        'player-p1-test',
        'wc',
      );

      const pityCall = enqueueDbWriteMock.mock.calls.find(
        (call) => call[0]?.type === 'recordPity',
      );
      expect(pityCall).toBeDefined();

      const job = pityCall![0];
      // Rare+ drop resets the pity counter
      expect(job.reset).toBe(true);

      // No synchronous pity writes
      expect(redisMock.incr).not.toHaveBeenCalled();
      expect(redisMock.incrby).not.toHaveBeenCalled();
      expect(redisMock.del).not.toHaveBeenCalled();
    },
  );
});
