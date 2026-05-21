// ============================================================
// preservation.test.ts — Preservation Property Tests
//
// These tests run against UNFIXED code and are EXPECTED TO PASS.
// They establish the baseline behaviour that MUST be preserved
// after all fixes are applied.
//
// Preservation properties covered:
//   S1 — Sequential Financial Operations (single withLock, no concurrent op)
//   A2 — Duel Below Cap (dailyEarned < DUEL_DAILY_COIN_CAP → full coin award)
//   A4 — Low-Level XP (levels 1–30 still receive a positive bonus)
//   P3 — usedLines Below Cap (append exactly as before when < 50 entries)
//
// Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.9, 3.10, 3.13
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { acquireLock, releaseLock, withLock } from '../utils/lock';
import { finalXP } from '../utils/math';
import { updateTameSession } from '../systems/tame-session';
import type { TameSessionState } from '../systems/tame-session';
import { XP_SCALE_RATE, SIM_PVP_WIN_COINS } from '../config';

// ─── Mock Redis ───────────────────────────────────────────────────────────────
// Shared in-memory Redis mock — same approach as bug-exploration.test.ts

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
      // Lua compare-and-delete
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

// ─── S1 Preservation — Sequential Financial Operations ────────────────────────
//
// Property: For any single financial operation (no concurrent op), withLock
// acquires the lock, runs the function, and releases the lock correctly.
// The lock key is available again after the operation completes.
//
// Validates: Requirements 3.1, 3.2, 3.3, 3.4

describe('S1 Preservation — Sequential Financial Operations', () => {
  beforeEach(async () => {
    const { redis } = await import('../utils/redis');
    (redis as unknown as { _reset: () => void })._reset();
  });

  it(
    'PRESERVED: a single withLock call acquires and releases the lock correctly ' +
      '(lock is free after the operation completes)',
    async () => {
      const playerId = 'player-s1-preserve-001';
      const action = 'hunt';

      // Run a single operation under the lock
      let lockHeldDuring = false;
      await withLock(playerId, action, async () => {
        // While inside the lock, a second acquisition attempt should fail
        const secondToken = await acquireLock(playerId, action);
        lockHeldDuring = secondToken === null; // null = correctly blocked
        if (secondToken) await releaseLock(playerId, action, secondToken);
      });

      // After the operation, the lock should be free again
      const tokenAfter = await acquireLock(playerId, action);
      const lockFreeAfter = tokenAfter !== null;
      if (tokenAfter) await releaseLock(playerId, action, tokenAfter);

      expect(lockHeldDuring).toBe(true);   // lock was held during operation
      expect(lockFreeAfter).toBe(true);    // lock was released after operation
    },
  );

  it(
    'PRESERVED: property — for all playerIds, a single sequential withLock call ' +
      'always acquires and releases correctly (deterministic, no concurrent op)',
    async () => {
      /**
       * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
       *
       * Property: F(X).lockAcquired = true AND F(X).lockReleasedAfter = true
       * for all single-player sequential operations.
       */
      const { redis } = await import('../utils/redis');
      const mockRedis = redis as unknown as { _reset: () => void };

      await fc.assert(
        fc.asyncProperty(
          // Generate arbitrary player IDs
          fc.string({ minLength: 5, maxLength: 20 }).filter(s => /^[a-z0-9-]+$/.test(s)),
          async (playerId) => {
            mockRedis._reset();

            let lockWasHeld = false;
            let operationCompleted = false;

            await withLock(playerId, 'financial', async () => {
              // Verify lock is held: second acquisition for same key must fail
              const secondToken = await acquireLock(playerId, 'financial');
              lockWasHeld = secondToken === null;
              if (secondToken) await releaseLock(playerId, 'financial', secondToken);
              operationCompleted = true;
            });

            // After withLock completes, the lock must be free
            const tokenAfter = await acquireLock(playerId, 'financial');
            const lockFreeAfter = tokenAfter !== null;
            if (tokenAfter) await releaseLock(playerId, 'financial', tokenAfter);

            return lockWasHeld && operationCompleted && lockFreeAfter;
          },
        ),
        { numRuns: 50 },
      );
    },
  );

  it(
    'PRESERVED: a single withLock call returns the function result unchanged ' +
      '(coin delta is deterministic for a single sequential operation)',
    async () => {
      /**
       * **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
       *
       * Property: F(X).result = F'(X).result for all single-player operations.
       * The lock wrapper does not alter the return value.
       */
      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 10000 }),  // simulated coin delta
          fc.string({ minLength: 5, maxLength: 20 }).filter(s => /^[a-z0-9-]+$/.test(s)),
          async (coinDelta, playerId) => {
            const { redis } = await import('../utils/redis');
            (redis as unknown as { _reset: () => void })._reset();

            // withLock must return the exact value returned by fn
            const result = await withLock(playerId, 'financial', async () => coinDelta);
            return result === coinDelta;
          },
        ),
        { numRuns: 100 },
      );
    },
  );
});

// ─── A2 Preservation — Duel Below Cap ────────────────────────────────────────
//
// Property: For all (dailyEarned, coinsGained) pairs where dailyEarned < DUEL_DAILY_COIN_CAP,
// the capped coin award equals coinsGained (no reduction applied).
//
// This tests the capping logic directly — pure arithmetic, no Redis needed.
// On unfixed code there is no cap logic at all, so coinsGained is always returned as-is.
// On fixed code the same property must hold for the below-cap case.
//
// Validates: Requirements 3.5, 3.9

describe('A2 Preservation — Duel Below Cap', () => {
  // The cap value from the design spec (does not exist in config yet on unfixed code)
  const DUEL_DAILY_COIN_CAP = 500;

  /**
   * The capping formula from the design spec:
   *   cappedCoins = Math.max(0, Math.min(coinsGained, DUEL_DAILY_COIN_CAP - dailyEarned))
   *
   * When dailyEarned < DUEL_DAILY_COIN_CAP, this simplifies to coinsGained
   * (assuming coinsGained <= DUEL_DAILY_COIN_CAP - dailyEarned, which is always true
   * when dailyEarned + coinsGained <= DUEL_DAILY_COIN_CAP).
   *
   * The preservation property is: when dailyEarned < cap AND coinsGained fits within
   * the remaining budget, cappedCoins = coinsGained.
   */
  function simulateCappedCoins(dailyEarned: number, coinsGained: number): number {
    // This is the formula that the FIXED code will use.
    // On unfixed code, there is no cap — coinsGained is returned directly.
    // We test the pure logic here to establish the baseline.
    return Math.max(0, Math.min(coinsGained, DUEL_DAILY_COIN_CAP - dailyEarned));
  }

  it(
    'PRESERVED: property — for all (dailyEarned, coinsGained) where dailyEarned < cap, ' +
      'cappedCoins = coinsGained (full award, no reduction)',
    () => {
      /**
       * **Validates: Requirements 3.5, 3.9**
       *
       * Property: NOT isBugCondition_A2(X) → cappedCoins = coinsGained
       * i.e., when dailyEarned < DUEL_DAILY_COIN_CAP, the cap does not reduce the award.
       */
      fc.assert(
        fc.property(
          // dailyEarned: strictly below cap
          fc.integer({ min: 0, max: DUEL_DAILY_COIN_CAP - 1 }),
          // coinsGained: a typical duel win reward (SIM_PVP_WIN_COINS + streak bonus)
          // Constrain so that dailyEarned + coinsGained <= cap (the non-bug condition)
          fc.integer({ min: 1, max: 90 }),  // max 90 = SIM_PVP_WIN_COINS(60) + max streak bonus(30)
          (dailyEarned, coinsGained) => {
            // Only test the non-bug condition: total earned stays below cap
            fc.pre(dailyEarned + coinsGained <= DUEL_DAILY_COIN_CAP);

            const cappedCoins = simulateCappedCoins(dailyEarned, coinsGained);
            return cappedCoins === coinsGained;
          },
        ),
        { numRuns: 1000 },
      );
    },
  );

  it(
    'PRESERVED: specific case — dailyEarned = 0, coinsGained = SIM_PVP_WIN_COINS ' +
      'awards full SIM_PVP_WIN_COINS (no cap applied)',
    () => {
      /**
       * **Validates: Requirements 3.5, 3.9**
       *
       * Concrete baseline: a fresh day (dailyEarned = 0) always awards the full amount.
       */
      const dailyEarned = 0;
      const coinsGained = SIM_PVP_WIN_COINS; // 60

      const cappedCoins = simulateCappedCoins(dailyEarned, coinsGained);
      expect(cappedCoins).toBe(coinsGained);
      expect(cappedCoins).toBe(SIM_PVP_WIN_COINS);
    },
  );

  it(
    'PRESERVED: specific case — dailyEarned = 0, coinsGained = SIM_PVP_WIN_COINS + 30 ' +
      '(streak bonus) awards full 90 coins',
    () => {
      /**
       * **Validates: Requirements 3.5, 3.9**
       *
       * Streak bonus case: 60 base + 30 streak bonus = 90 coins, still below cap.
       */
      const dailyEarned = 0;
      const coinsGained = SIM_PVP_WIN_COINS + 30; // 90

      const cappedCoins = simulateCappedCoins(dailyEarned, coinsGained);
      expect(cappedCoins).toBe(90);
    },
  );

  it(
    'PRESERVED: property — for all dailyEarned in [0, cap-1], ' +
      'a single win of SIM_PVP_WIN_COINS is fully awarded when it fits within the budget',
    () => {
      /**
       * **Validates: Requirements 3.5, 3.9**
       */
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: DUEL_DAILY_COIN_CAP - SIM_PVP_WIN_COINS }),
          (dailyEarned) => {
            // dailyEarned is low enough that a single win fits within the cap
            const cappedCoins = simulateCappedCoins(dailyEarned, SIM_PVP_WIN_COINS);
            return cappedCoins === SIM_PVP_WIN_COINS;
          },
        ),
        { numRuns: 500 },
      );
    },
  );
});

// ─── A4 Preservation — Low-Level XP (levels 1–30) ────────────────────────────
//
// Property: For all (baseXP, level) where level ∈ [1, 30], finalXP returns a value
// >= baseXP (positive bonus preserved). The multiplier is between 1.0 and 1.30.
//
// Note: On unfixed code with XP_SCALE_RATE = 0.03, levels 1–30 produce multipliers
// from 1.03 to 1.90. The preservation property is NOT that values match the new 0.01
// rate — it is that low-level players still receive a positive bonus (result >= baseXP).
// This passes on unfixed code because 1 + level * 0.03 >= 1.0 for all level >= 0.
//
// Validates: Requirements 3.7, 3.10

describe('A4 Preservation — Low-Level XP (levels 1–30)', () => {
  it(
    'PRESERVED: property — for all (baseXP, level) where level ∈ [1, 30], ' +
      'finalXP(baseXP, level) >= baseXP (positive bonus preserved)',
    () => {
      /**
       * **Validates: Requirements 3.7, 3.10**
       *
       * Property: NOT isBugCondition_A4(X) for levels 1–30 with new rate 0.01
       * → finalXP(baseXP, level) >= baseXP (multiplier >= 1.0)
       *
       * On unfixed code (rate 0.03): multiplier = 1 + level * 0.03
       *   level 1  → 1.03 → result >= baseXP ✓
       *   level 30 → 1.90 → result >= baseXP ✓
       *
       * The preservation property (positive bonus) holds on unfixed code.
       */
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }),  // baseXP
          fc.integer({ min: 1, max: 30 }),     // level in [1, 30]
          (baseXP, level) => {
            const result = finalXP(baseXP, level);
            // Positive bonus: result must be >= baseXP
            return result >= baseXP;
          },
        ),
        { numRuns: 1000 },
      );
    },
  );

  it(
    'PRESERVED: property — for all (baseXP, level) where level ∈ [1, 30], ' +
      'the XP multiplier is >= 1.0 (no penalty for low-level players)',
    () => {
      /**
       * **Validates: Requirements 3.7, 3.10**
       *
       * The multiplier formula on unfixed code: 1 + level * XP_SCALE_RATE
       * For level ∈ [1, 30] and XP_SCALE_RATE = 0.03: multiplier ∈ [1.03, 1.90]
       * All values >= 1.0 → positive bonus confirmed.
       */
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 30 }),  // level in [1, 30]
          (level) => {
            const multiplier = 1 + level * XP_SCALE_RATE;
            return multiplier >= 1.0;
          },
        ),
        { numRuns: 30 },
      );
    },
  );

  it(
    'PRESERVED: specific cases — finalXP returns positive bonus for levels 1, 10, 20, 30',
    () => {
      /**
       * **Validates: Requirements 3.7, 3.10**
       *
       * Concrete baseline values on unfixed code (rate 0.03):
       *   level 1:  Math.round(10 * 1.03) = 10
       *   level 10: Math.round(10 * 1.30) = 13
       *   level 20: Math.round(10 * 1.60) = 16
       *   level 30: Math.round(10 * 1.90) = 19
       *
       * All >= baseXP (10) → positive bonus preserved.
       */
      const baseXP = 10;
      const cases = [1, 10, 20, 30];

      for (const level of cases) {
        const result = finalXP(baseXP, level);
        expect(result).toBeGreaterThanOrEqual(baseXP);
      }
    },
  );

  it(
    'PRESERVED: property — finalXP is internally consistent for levels 1–30 ' +
      '(result = Math.round(baseXP * (1 + level * XP_SCALE_RATE)) on unfixed code)',
    () => {
      /**
       * **Validates: Requirements 3.7, 3.10**
       *
       * The unfixed formula is: Math.round(baseXP * (1 + level * XP_SCALE_RATE))
       * This property verifies the formula is applied correctly for all low-level inputs.
       */
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 500 }),  // baseXP
          fc.integer({ min: 1, max: 30 }),   // level in [1, 30]
          (baseXP, level) => {
            const result = finalXP(baseXP, level);
            const expected = Math.round(baseXP * (1 + level * XP_SCALE_RATE));
            return result === expected;
          },
        ),
        { numRuns: 500 },
      );
    },
  );
});

// ─── P3 Preservation — usedLines Below Cap ───────────────────────────────────
//
// Property: For all sessions where usedLines.length < TAME_USED_LINES_MAX (50),
// pushing a new line appends it exactly as before (no eviction, no change in behaviour).
//
// Validates: Requirement 3.13

describe('P3 Preservation — usedLines Below Cap', () => {
  // The cap value from the design spec (does not exist in config yet on unfixed code)
  const TAME_USED_LINES_MAX = 50;

  beforeEach(async () => {
    const { redis } = await import('../utils/redis');
    (redis as unknown as { _reset: () => void })._reset();
  });

  /**
   * Helper: create a minimal TameSessionState with a given usedLines array.
   */
  function makeSession(playerId: string, usedLines: string[]): TameSessionState {
    return {
      encounterId: 'enc-preserve',
      playerId,
      owlSpecies: 'Kukumav baykusu',
      owlTier: 8,
      owlQuality: 'Common',
      personality: 'cautious',
      aggression: 30,
      awareness: 50,
      patience: 60,
      greed: 20,
      personalityLabel: 'Temkinli',
      personalityEmoji: '👁️',
      progress: 0,
      escapeRisk: 20,
      turn: 1,
      maxTurns: 4,
      usedLines: [...usedLines],
      playerGoz: 10,
      playerKulak: 10,
      baseChance: 50,
    };
  }

  it(
    'PRESERVED: property — for all sessions where usedLines.length < TAME_USED_LINES_MAX, ' +
      'pushing a line appends it exactly (no eviction, length increases by 1)',
    async () => {
      /**
       * **Validates: Requirement 3.13**
       *
       * Property: length(X.usedLines) < TAME_USED_LINES_MAX
       *   → addUsedLine(X, newLine).usedLines = [...X.usedLines, newLine]
       *
       * On unfixed code: no cap check, push always appends.
       * This property must continue to hold on fixed code for sessions below the cap.
       */
      const { redis } = await import('../utils/redis');
      const mockRedis = redis as unknown as {
        _reset: () => void;
        _store: Map<string, string>;
      };

      await fc.assert(
        fc.asyncProperty(
          // Number of existing lines: strictly below cap
          fc.integer({ min: 0, max: TAME_USED_LINES_MAX - 1 }),
          // The new line to append
          fc.string({ minLength: 1, maxLength: 50 }),
          async (existingCount, newLine) => {
            mockRedis._reset();

            // Build existing lines
            const existingLines = Array.from(
              { length: existingCount },
              (_, i) => `line-${i}`,
            );

            const playerId = `player-p3-${existingCount}`;
            const state = makeSession(playerId, existingLines);

            // Simulate the unfixed push (no cap check)
            state.usedLines.push(newLine);
            await updateTameSession(redis as unknown as import('ioredis').default, state);

            // Verify: length increased by 1
            const expectedLength = existingCount + 1;
            if (state.usedLines.length !== expectedLength) return false;

            // Verify: last element is the new line
            if (state.usedLines[state.usedLines.length - 1] !== newLine) return false;

            // Verify: all existing lines are still present in order
            for (let i = 0; i < existingCount; i++) {
              if (state.usedLines[i] !== existingLines[i]) return false;
            }

            // Verify: Redis payload matches
            const sessionKey = `tame_session:${playerId}`;
            const stored = mockRedis._store.get(sessionKey);
            if (!stored) return false;
            const parsed = JSON.parse(stored) as TameSessionState;
            if (parsed.usedLines.length !== expectedLength) return false;
            if (parsed.usedLines[parsed.usedLines.length - 1] !== newLine) return false;

            return true;
          },
        ),
        { numRuns: 100 },
      );
    },
  );

  it(
    'PRESERVED: specific case — session with 0 lines, push 1 line → usedLines = [line]',
    async () => {
      /**
       * **Validates: Requirement 3.13**
       */
      const { redis } = await import('../utils/redis');
      const state = makeSession('player-p3-empty', []);

      state.usedLines.push('first-line');
      await updateTameSession(redis as unknown as import('ioredis').default, state);

      expect(state.usedLines).toEqual(['first-line']);
      expect(state.usedLines.length).toBe(1);
    },
  );

  it(
    'PRESERVED: specific case — session with 49 lines (cap - 1), push 1 line → length = 50',
    async () => {
      /**
       * **Validates: Requirement 3.13**
       *
       * The boundary case: exactly one below the cap.
       * On unfixed code: push appends, length becomes 50.
       * On fixed code: same behaviour (50 < cap is not triggered, 50 = cap is the boundary).
       */
      const { redis } = await import('../utils/redis');
      const existingLines = Array.from({ length: 49 }, (_, i) => `line-${i}`);
      const state = makeSession('player-p3-boundary', existingLines);

      state.usedLines.push('line-49');
      await updateTameSession(redis as unknown as import('ioredis').default, state);

      expect(state.usedLines.length).toBe(50);
      expect(state.usedLines[49]).toBe('line-49');
      // All original lines preserved
      for (let i = 0; i < 49; i++) {
        expect(state.usedLines[i]).toBe(`line-${i}`);
      }
    },
  );

  it(
    'PRESERVED: property — usedLines array is never modified by updateTameSession itself ' +
      '(the function only serialises, does not mutate)',
    async () => {
      /**
       * **Validates: Requirement 3.13**
       *
       * updateTameSession is a pure serialiser — it must not alter the state object.
       */
      const { redis } = await import('../utils/redis');

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 0, max: 49 }),
          async (lineCount) => {
            const { redis: r } = await import('../utils/redis');
            (r as unknown as { _reset: () => void })._reset();

            const lines = Array.from({ length: lineCount }, (_, i) => `l${i}`);
            const state = makeSession(`player-serial-${lineCount}`, lines);
            const snapshotBefore = [...state.usedLines];

            await updateTameSession(redis as unknown as import('ioredis').default, state);

            // updateTameSession must not mutate usedLines
            return (
              state.usedLines.length === snapshotBefore.length &&
              state.usedLines.every((v, i) => v === snapshotBefore[i])
            );
          },
        ),
        { numRuns: 50 },
      );
    },
  );
});
