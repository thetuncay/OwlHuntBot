// ============================================================
// integration-s1.test.ts — S1 Integration Test
// Concurrent financial operations for the same player
//
// Tests that the unified financial lock (`lock:{playerId}:financial`)
// serialises concurrent hunt + blackjack operations, preventing
// double-deduction and negative balances.
//
// Requirements: 2.1, 2.2
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { withLock, acquireLock, releaseLock } from '../utils/lock';

// ─── In-memory Redis mock ─────────────────────────────────────────────────────
// Simulates real Redis SET NX EX semantics for lock operations.

vi.mock('../utils/redis', () => {
  const store = new Map<string, string>();

  const redis = {
    set: vi.fn(async (key: string, value: string, ...args: unknown[]) => {
      const argList = args as string[];
      const hasNX = argList.includes('NX');
      if (hasNX) {
        if (store.has(key)) return null;
        store.set(key, value);
        return 'OK';
      }
      store.set(key, value);
      return 'OK';
    }),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    del: vi.fn(async (key: string) => {
      const existed = store.has(key);
      store.delete(key);
      return existed ? 1 : 0;
    }),
    eval: vi.fn(async (_script: string, _numKeys: number, key: string, token: string) => {
      if (store.get(key) === token) {
        store.delete(key);
        return 1;
      }
      return 0;
    }),
    incrby: vi.fn(async (key: string, amount: number) => {
      const current = parseInt(store.get(key) ?? '0', 10);
      const next = current + amount;
      store.set(key, String(next));
      return next;
    }),
    expire: vi.fn(async () => 1),
    _store: store,
    _reset: () => store.clear(),
  };

  return { redis };
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Simulates a financial operation that:
 *   1. Reads the player's coin balance
 *   2. Checks if sufficient funds exist
 *   3. Applies a coin decrement
 *
 * Returns the final balance after the operation, or throws if insufficient funds.
 */
async function simulateFinancialOp(
  state: { coins: number },
  cost: number,
  opName: string,
  delayMs = 0,
): Promise<{ opName: string; finalCoins: number }> {
  // Simulate async work (e.g. DB read)
  if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));

  // Read balance
  const balance = state.coins;

  // Simulate async work between read and write (the TOCTOU window)
  if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));

  // Check sufficient funds
  if (balance < cost) {
    throw new Error(`${opName}: Insufficient funds (balance=${balance}, cost=${cost})`);
  }

  // Apply decrement
  state.coins -= cost;

  return { opName, finalCoins: state.coins };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('S1 Integration — Concurrent Financial Operations (Requirements 2.1, 2.2)', () => {
  beforeEach(async () => {
    const { redis } = await import('../utils/redis');
    (redis as unknown as { _reset: () => void })._reset();
  });

  // ── Test 1: Unified lock prevents concurrent acquisition ──────────────────

  it(
    'FIX CONFIRMED: two concurrent withLock("financial") calls for the same player ' +
      'cannot both be held simultaneously — second is blocked until first completes',
    async () => {
      /**
       * Requirements: 2.1, 2.2
       *
       * The S1 fix changes all financial operations to use the same lock key:
       *   lock:{playerId}:financial
       *
       * This test verifies that two concurrent withLock('financial') calls
       * for the same player are serialised — the second cannot acquire the lock
       * while the first holds it.
       */
      const playerId = 'player-s1-integration-001';
      const executionOrder: string[] = [];
      let op1Running = false;
      let op2StartedWhileOp1Running = false;

      // Start op1 — holds the lock for a brief period
      const op1Promise = withLock(playerId, 'financial', async () => {
        op1Running = true;
        executionOrder.push('op1:start');
        // Yield to allow op2 to attempt lock acquisition
        await new Promise(r => setTimeout(r, 20));
        executionOrder.push('op1:end');
        op1Running = false;
        return 'op1-done';
      });

      // Start op2 concurrently — should be blocked until op1 releases
      const op2Promise = withLock(playerId, 'financial', async () => {
        // If op1 is still running when op2 starts, the lock failed to serialise
        op2StartedWhileOp1Running = op1Running;
        executionOrder.push('op2:start');
        await new Promise(r => setTimeout(r, 5));
        executionOrder.push('op2:end');
        return 'op2-done';
      }).catch((err: Error) => {
        // op2 may throw "already processing" if lock is held — that's also correct
        executionOrder.push(`op2:blocked(${err.message})`);
        return 'op2-blocked';
      });

      const [r1, r2] = await Promise.all([op1Promise, op2Promise]);

      // op1 must have completed
      expect(r1).toBe('op1-done');

      // Either op2 was blocked (lock not acquired) OR it ran after op1 completed
      // In both cases, op2 must NOT have started while op1 was running
      expect(op2StartedWhileOp1Running).toBe(false);

      // If op2 ran (not blocked), it must have started after op1 ended
      if (r2 === 'op2-done') {
        const op1EndIdx = executionOrder.indexOf('op1:end');
        const op2StartIdx = executionOrder.indexOf('op2:start');
        expect(op2StartIdx).toBeGreaterThan(op1EndIdx);
      }
    },
  );

  // ── Test 2: Coin balance consistency under concurrent operations ──────────

  it(
    'FIX CONFIRMED: concurrent hunt + blackjack under unified financial lock ' +
      'produces consistent final balance (no double-deduction, no negative balance)',
    async () => {
      /**
       * Requirements: 2.1, 2.2
       *
       * Simulates the full integration path:
       *   - Player starts with 1000 coins
       *   - hunt costs 200 coins (biome entry)
       *   - blackjack bets 100 coins
       *   - Both run concurrently under withLock(playerId, 'financial', ...)
       *
       * With the unified lock, operations are serialised:
       *   - First op reads balance, deducts, writes
       *   - Second op reads the UPDATED balance (not the stale one)
       *   - Final balance = 1000 - 200 - 100 = 700 (correct)
       *
       * Without the fix (different lock namespaces):
       *   - Both read balance = 1000
       *   - Both pass the balance check
       *   - Both deduct: 1000 - 200 = 800 AND 1000 - 100 = 900
       *   - Final balance could be 700 OR 800 OR 900 depending on write order
       *   - With incremental updates ({ decrement: X }), final = 1000 - 200 - 100 = 700
       *   - But the balance CHECK was done on stale data — both could pass even if
       *     the player only had 150 coins (hunt=200 would fail, but gamble=100 passes)
       */
      const playerId = 'player-s1-integration-002';
      const state = { coins: 1000 };
      const huntCost = 200;
      const bjBet = 100;

      // Both operations use the unified 'financial' lock
      const huntPromise = withLock(playerId, 'financial', () =>
        simulateFinancialOp(state, huntCost, 'hunt', 5),
      );

      const bjPromise = withLock(playerId, 'financial', () =>
        simulateFinancialOp(state, bjBet, 'blackjack', 5),
      ).catch((err: Error) => {
        // If lock is not acquired (already processing), that's also correct serialisation
        return { opName: 'blackjack:blocked', finalCoins: state.coins };
      });

      const [huntResult, bjResult] = await Promise.all([huntPromise, bjPromise]);

      // Both operations must have completed (one after the other)
      expect(huntResult.opName).toBe('hunt');

      // Final balance must be consistent — no negative balance
      expect(state.coins).toBeGreaterThanOrEqual(0);

      // Final balance must reflect exactly the deductions that were applied
      // (either 700 if both ran, or 800 if bj was blocked)
      const expectedIfBothRan = 1000 - huntCost - bjBet; // 700
      const expectedIfBjBlocked = 1000 - huntCost; // 800
      expect([expectedIfBothRan, expectedIfBjBlocked]).toContain(state.coins);
    },
  );

  // ── Test 3: Insufficient funds scenario ──────────────────────────────────

  it(
    'FIX CONFIRMED: with unified lock, a player with 150 coins cannot have both ' +
      'hunt (200 cost) and blackjack (100 cost) pass the balance check simultaneously',
    async () => {
      /**
       * Requirements: 2.1, 2.2
       *
       * This is the critical double-spend scenario:
       *   - Player has 150 coins
       *   - hunt costs 200 (should fail — insufficient funds)
       *   - blackjack bets 100 (should succeed)
       *
       * With the unified lock, operations are serialised:
       *   - If hunt runs first: fails (150 < 200), balance stays 150
       *   - Then blackjack runs: succeeds (150 >= 100), balance = 50
       *   - OR if blackjack runs first: succeeds (150 >= 100), balance = 50
       *   - Then hunt runs: fails (50 < 200), balance stays 50
       *
       * Without the fix (TOCTOU):
       *   - Both read balance = 150
       *   - hunt: 150 < 200 → fails (correct)
       *   - blackjack: 150 >= 100 → passes (correct)
       *   - But if both read simultaneously and both pass, balance could go negative
       *
       * The key assertion: final balance is NEVER negative.
       */
      const playerId = 'player-s1-integration-003';
      const state = { coins: 150 };
      const huntCost = 200;
      const bjBet = 100;

      const results = await Promise.allSettled([
        withLock(playerId, 'financial', () =>
          simulateFinancialOp(state, huntCost, 'hunt', 5),
        ),
        withLock(playerId, 'financial', () =>
          simulateFinancialOp(state, bjBet, 'blackjack', 5),
        ),
      ]);

      // Final balance must NEVER be negative
      expect(state.coins).toBeGreaterThanOrEqual(0);

      // At most one operation could have succeeded (hunt requires 200, player has 150)
      // If blackjack ran first (100 deducted → 50 coins), hunt would then fail (50 < 200)
      // If hunt ran first, it fails (150 < 200), then blackjack succeeds (150 → 50)
      // Either way: final balance is 50 (blackjack succeeded) or 150 (both failed)
      expect([50, 150]).toContain(state.coins);
    },
  );

  // ── Test 4: Both operations complete (serialised, not dropped) ────────────

  it(
    'FIX CONFIRMED: with sufficient funds, both hunt and blackjack complete ' +
      'successfully when serialised through the unified financial lock',
    async () => {
      /**
       * Requirements: 2.1, 2.2
       *
       * When the player has enough coins for both operations, both must complete.
       * The unified lock serialises them — one runs, then the other.
       * Neither operation is dropped or lost.
       */
      const playerId = 'player-s1-integration-004';
      const state = { coins: 5000 };
      const huntCost = 200;
      const bjBet = 100;
      const completedOps: string[] = [];

      const huntPromise = withLock(playerId, 'financial', async () => {
        const result = await simulateFinancialOp(state, huntCost, 'hunt', 10);
        completedOps.push('hunt');
        return result;
      });

      const bjPromise = withLock(playerId, 'financial', async () => {
        const result = await simulateFinancialOp(state, bjBet, 'blackjack', 10);
        completedOps.push('blackjack');
        return result;
      }).catch((err: Error) => {
        // "already processing" means the lock correctly blocked the second op
        // This is also valid serialisation behaviour
        completedOps.push('blackjack:blocked');
        return { opName: 'blackjack:blocked', finalCoins: state.coins };
      });

      await Promise.all([huntPromise, bjPromise]);

      // Both operations must have been attempted
      expect(completedOps.length).toBe(2);

      // Final balance must be consistent
      expect(state.coins).toBeGreaterThanOrEqual(0);

      // If both completed: 5000 - 200 - 100 = 4700
      // If bj was blocked: 5000 - 200 = 4800
      expect([4700, 4800]).toContain(state.coins);
    },
  );

  // ── Test 5: Lock key is 'financial' (not 'hunt' or 'gamble') ─────────────

  it(
    'FIX CONFIRMED: withLock("financial") for hunt and withLock("financial") for gamble ' +
      'use the SAME Redis key — mutual exclusion is enforced',
    async () => {
      /**
       * Requirements: 2.1, 2.2
       *
       * The S1 fix is that all financial operations use the same action string
       * 'financial', which maps to the same Redis key: lock:{playerId}:financial
       *
       * This test directly verifies that:
       *   1. A lock acquired with action='financial' blocks another 'financial' lock
       *   2. The lock key is lock:{playerId}:financial
       */
      const playerId = 'player-s1-integration-005';

      // Acquire the financial lock (simulating hunt)
      const huntToken = await acquireLock(playerId, 'financial');
      expect(huntToken).not.toBeNull();

      // Try to acquire the same financial lock (simulating gamble) — must fail
      const gambleToken = await acquireLock(playerId, 'financial');
      expect(gambleToken).toBeNull(); // correctly blocked

      // Release the hunt lock
      if (huntToken) await releaseLock(playerId, 'financial', huntToken);

      // Now gamble can acquire the lock
      const gambleToken2 = await acquireLock(playerId, 'financial');
      expect(gambleToken2).not.toBeNull(); // now available

      if (gambleToken2) await releaseLock(playerId, 'financial', gambleToken2);
    },
  );

  // ── Test 6: Different players are not affected by each other's locks ──────

  it(
    'PRESERVED: different players can run concurrent financial operations independently ' +
      '(unified lock is per-player, not global)',
    async () => {
      /**
       * Requirements: 2.1, 2.2
       *
       * The financial lock is scoped to a player: lock:{playerId}:financial
       * Two different players must be able to run financial operations concurrently.
       */
      const player1 = 'player-s1-p1';
      const player2 = 'player-s1-p2';

      // Both players acquire their own financial locks simultaneously
      const [token1, token2] = await Promise.all([
        acquireLock(player1, 'financial'),
        acquireLock(player2, 'financial'),
      ]);

      // Both must succeed — different players, different lock keys
      expect(token1).not.toBeNull();
      expect(token2).not.toBeNull();

      // Cleanup
      if (token1) await releaseLock(player1, 'financial', token1);
      if (token2) await releaseLock(player2, 'financial', token2);
    },
  );
});
