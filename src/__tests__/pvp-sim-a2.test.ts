// ============================================================
// pvp-sim-a2.test.ts — A2 Fix: Duel Daily Coin Cap Boundary Tests
//
// Unit tests for the daily coin cap enforcement in runSimulatedPvP.
// Tests the boundary behaviour of the capping formula:
//   cappedCoins = Math.max(0, Math.min(coinsGained, DUEL_DAILY_COIN_CAP - dailyEarned))
//
// Test cases:
//   1. dailyEarned = 499 → coinsGained = 1 (partial award up to cap)
//   2. dailyEarned = 500 → coinsGained = 0, xpGained > 0 (cap reached, XP unaffected)
//   3. dailyEarned = 0   → coinsGained = SIM_PVP_WIN_COINS + bonusCoins (full award)
//
// Validates: Requirements 2.7, 2.8
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DUEL_DAILY_COIN_CAP, SIM_PVP_WIN_COINS } from '../config';

// ─── Module mocks (declared before imports) ──────────────────────────────────

// Mock the leaderboard module — these fire-and-forget calls are not under test
vi.mock('../systems/leaderboard', () => ({
  recordPvpWin:       vi.fn(async () => undefined),
  recordCoinsEarned:  vi.fn(async () => undefined),
  refreshPowerScore:  vi.fn(async () => 0),
}));

// Mock the xp module — XP logic is not under test here
vi.mock('../systems/xp', () => ({
  addXP: vi.fn(async () => ({ levelUp: false, newLevel: 10, xpAdded: 0 })),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a minimal Prisma mock that returns a player and main owl.
 * The player has pvpStreak=0 so bonusCoins = 0 (streak threshold not reached).
 */
function buildPrismaMock() {
  const player = {
    id: 'player-a2-test',
    level: 10,
    pvpStreak: 0,
    pvpBestStreak: 0,
    prestigeLevel: 0,
    coins: 1000,
  };

  const mainOwl = {
    hp: 100,
    hpMax: 100,
    staminaCur: 100,
    statGaga: 10,
    statPence: 10,
    statKanat: 10,
  };

  const prisma = {
    player: {
      findUnique: vi.fn(async () => player),
      update: vi.fn(async () => ({ ...player })),
    },
    owl: {
      findFirst: vi.fn(async () => mainOwl),
    },
  };

  return { prisma, player, mainOwl };
}

/**
 * Build a Redis mock that returns a specific dailyEarned value for any key.
 * incrby and expire are no-ops.
 */
function buildRedisMock(dailyEarned: number) {
  const redis = {
    get:    vi.fn(async (_key: string) => dailyEarned === 0 ? null : String(dailyEarned)),
    incrby: vi.fn(async () => dailyEarned + 1),
    expire: vi.fn(async () => 1),
    set:    vi.fn(async () => 'OK'),
    del:    vi.fn(async () => 1),
    eval:   vi.fn(async () => 1),
  };
  return redis;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('A2 Fix — Duel Daily Coin Cap Boundary (Requirements 2.7, 2.8)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Pure formula tests (no Prisma/Redis needed) ───────────────────────────
  //
  // The capping formula is:
  //   cappedCoins = Math.max(0, Math.min(coinsGained, DUEL_DAILY_COIN_CAP - dailyEarned))
  //
  // These tests verify the formula directly, independent of the full function.

  describe('Capping formula — pure unit tests', () => {
    /**
     * Helper: apply the capping formula exactly as implemented in pvp-sim.ts
     */
    function applyCap(coinsGained: number, dailyEarned: number): number {
      return Math.max(0, Math.min(coinsGained, DUEL_DAILY_COIN_CAP - dailyEarned));
    }

    it(
      'dailyEarned = 499 → partial award: coinsGained is capped to 1 (500 - 499 = 1)',
      () => {
        /**
         * **Validates: Requirements 2.7, 2.8**
         *
         * Property 4: Bug Condition — Bot Duel Daily Cap Enforced
         * When dailyEarned = 499 and coinsGained = SIM_PVP_WIN_COINS (60),
         * only 1 coin remains in the budget → cappedCoins = 1.
         */
        const dailyEarned = 499;
        const coinsGained = SIM_PVP_WIN_COINS; // 60

        const cappedCoins = applyCap(coinsGained, dailyEarned);

        expect(cappedCoins).toBe(1);
        expect(cappedCoins).toBe(DUEL_DAILY_COIN_CAP - dailyEarned);
      },
    );

    it(
      'dailyEarned = 500 → cap reached: coinsGained = 0 (no coins awarded)',
      () => {
        /**
         * **Validates: Requirements 2.7, 2.8**
         *
         * Property 4: Bug Condition — Bot Duel Daily Cap Enforced
         * When dailyEarned = DUEL_DAILY_COIN_CAP (500), the remaining budget is 0.
         * cappedCoins = Math.max(0, Math.min(60, 500 - 500)) = Math.max(0, 0) = 0
         */
        const dailyEarned = DUEL_DAILY_COIN_CAP; // 500
        const coinsGained = SIM_PVP_WIN_COINS;   // 60

        const cappedCoins = applyCap(coinsGained, dailyEarned);

        expect(cappedCoins).toBe(0);
      },
    );

    it(
      'dailyEarned = 0 → full award: coinsGained = SIM_PVP_WIN_COINS (no cap applied)',
      () => {
        /**
         * **Validates: Requirements 2.7, 2.8**
         *
         * Property 5: Preservation — Bot Duel Below Cap Unchanged
         * When dailyEarned = 0, the full coin reward is awarded.
         * cappedCoins = Math.max(0, Math.min(60, 500 - 0)) = 60
         */
        const dailyEarned = 0;
        const coinsGained = SIM_PVP_WIN_COINS; // 60

        const cappedCoins = applyCap(coinsGained, dailyEarned);

        expect(cappedCoins).toBe(SIM_PVP_WIN_COINS);
        expect(cappedCoins).toBe(60);
      },
    );

    it(
      'dailyEarned = 0, coinsGained = SIM_PVP_WIN_COINS + 30 (streak bonus) → full 90 coins',
      () => {
        /**
         * **Validates: Requirements 2.7, 2.8**
         *
         * Property 5: Preservation — streak bonus is fully awarded when below cap.
         * cappedCoins = Math.max(0, Math.min(90, 500 - 0)) = 90
         */
        const dailyEarned = 0;
        const bonusCoins = 30; // streak 5+ bonus
        const coinsGained = SIM_PVP_WIN_COINS + bonusCoins; // 90

        const cappedCoins = applyCap(coinsGained, dailyEarned);

        expect(cappedCoins).toBe(SIM_PVP_WIN_COINS + bonusCoins);
        expect(cappedCoins).toBe(90);
      },
    );

    it(
      'dailyEarned > DUEL_DAILY_COIN_CAP → coinsGained = 0 (never negative)',
      () => {
        /**
         * **Validates: Requirements 2.7, 2.8**
         *
         * Edge case: dailyEarned somehow exceeds the cap (e.g. due to a race).
         * Math.max(0, ...) ensures cappedCoins is never negative.
         */
        const dailyEarned = DUEL_DAILY_COIN_CAP + 50; // 550
        const coinsGained = SIM_PVP_WIN_COINS;

        const cappedCoins = applyCap(coinsGained, dailyEarned);

        expect(cappedCoins).toBe(0);
        expect(cappedCoins).toBeGreaterThanOrEqual(0);
      },
    );

    it(
      'boundary: dailyEarned = 440, coinsGained = 60 → cappedCoins = 60 (exactly fits)',
      () => {
        /**
         * **Validates: Requirements 2.7, 2.8**
         *
         * 440 + 60 = 500 = cap exactly. Full award is given.
         */
        const dailyEarned = 440;
        const coinsGained = SIM_PVP_WIN_COINS; // 60

        const cappedCoins = applyCap(coinsGained, dailyEarned);

        expect(cappedCoins).toBe(60);
        expect(dailyEarned + cappedCoins).toBe(DUEL_DAILY_COIN_CAP);
      },
    );

    it(
      'boundary: dailyEarned = 441, coinsGained = 60 → cappedCoins = 59 (partial award)',
      () => {
        /**
         * **Validates: Requirements 2.7, 2.8**
         *
         * 441 + 60 = 501 > cap. Only 59 coins remain in the budget.
         */
        const dailyEarned = 441;
        const coinsGained = SIM_PVP_WIN_COINS; // 60

        const cappedCoins = applyCap(coinsGained, dailyEarned);

        expect(cappedCoins).toBe(59);
        expect(dailyEarned + cappedCoins).toBe(DUEL_DAILY_COIN_CAP);
      },
    );
  });

  // ── Integration tests: runSimulatedPvP with mocked Prisma + Redis ─────────
  //
  // These tests call the real runSimulatedPvP function with mocked dependencies.
  // We force playerWon = true by giving the player very high stats (statGaga=100,
  // statPence=100, statKanat=100) so the player's power far exceeds any fake opponent.
  // We also mock Math.random to return 0 (minimum RNG) to ensure deterministic outcomes.

  describe('runSimulatedPvP — integration with mocked Prisma + Redis', () => {
    beforeEach(() => {
      // Force Math.random to return 0 so the player always wins:
      // - Player power is very high (stats 100 each)
      // - Fake opponent power is scaled to player power × difficulty ratio × variation
      // - With Math.random = 0, variation = 0.92 (minimum), opponent is weakest possible
      // - Player attacks first each turn and deals maximum deterministic damage
      vi.spyOn(Math, 'random').mockReturnValue(0);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    /**
     * Build a Prisma mock with very high owl stats to ensure player wins.
     */
    function buildStrongPlayerPrismaMock() {
      const player = {
        id: 'player-a2-strong',
        level: 10,
        pvpStreak: 0,
        pvpBestStreak: 0,
        prestigeLevel: 0,
        coins: 1000,
      };

      // Very high stats → player power >> opponent power → player always wins
      const mainOwl = {
        hp: 100,
        hpMax: 100,
        staminaCur: 100,
        statGaga: 100,
        statPence: 100,
        statKanat: 100,
      };

      const prisma = {
        player: {
          findUnique: vi.fn(async () => player),
          update: vi.fn(async () => ({ ...player })),
        },
        owl: {
          findFirst: vi.fn(async () => mainOwl),
        },
      };

      return { prisma, player, mainOwl };
    }

    it(
      'dailyEarned = 499 → result.coinsGained = 1 (partial award up to cap)',
      async () => {
        /**
         * **Validates: Requirements 2.7, 2.8**
         *
         * Property 4: Bug Condition — Bot Duel Daily Cap Enforced
         * With 499 coins already earned today, only 1 coin remains in the budget.
         * The function must award exactly 1 coin regardless of the base reward.
         */
        const { prisma } = buildStrongPlayerPrismaMock();
        const redis = buildRedisMock(499);

        const { runSimulatedPvP } = await import('../systems/pvp-sim');

        const result = await runSimulatedPvP(
          prisma as unknown as import('@prisma/client').PrismaClient,
          'player-a2-strong',
          redis as unknown as import('ioredis').default,
        );

        // The player must have won for the cap to be relevant
        expect(result.playerWon).toBe(true);

        // With dailyEarned = 499, only 1 coin remains in the budget
        expect(result.coinsGained).toBe(1);

        // XP is always awarded regardless of the coin cap
        expect(result.xpGained).toBeGreaterThan(0);
      },
    );

    it(
      'dailyEarned = 500 → result.coinsGained = 0 and xpGained > 0 (cap reached, XP unaffected)',
      async () => {
        /**
         * **Validates: Requirements 2.7, 2.8**
         *
         * Property 4: Bug Condition — Bot Duel Daily Cap Enforced
         * When the daily cap is already reached (dailyEarned = 500),
         * no coins are awarded but XP is still given in full.
         */
        const { prisma } = buildStrongPlayerPrismaMock();
        const redis = buildRedisMock(500);

        const { runSimulatedPvP } = await import('../systems/pvp-sim');

        const result = await runSimulatedPvP(
          prisma as unknown as import('@prisma/client').PrismaClient,
          'player-a2-strong',
          redis as unknown as import('ioredis').default,
        );

        expect(result.playerWon).toBe(true);

        // Cap reached → zero coins awarded
        expect(result.coinsGained).toBe(0);

        // XP is NOT affected by the coin cap — must be positive
        expect(result.xpGained).toBeGreaterThan(0);
      },
    );

    it(
      'dailyEarned = 0 → result.coinsGained = SIM_PVP_WIN_COINS + bonusCoins (full award)',
      async () => {
        /**
         * **Validates: Requirements 2.7, 2.8**
         *
         * Property 5: Preservation — Bot Duel Below Cap Unchanged
         * On a fresh day (dailyEarned = 0), the full coin reward is awarded.
         * With pvpStreak = 0, bonusCoins = 0, so coinsGained = SIM_PVP_WIN_COINS.
         */
        const { prisma } = buildStrongPlayerPrismaMock();
        const redis = buildRedisMock(0);

        const { runSimulatedPvP } = await import('../systems/pvp-sim');

        const result = await runSimulatedPvP(
          prisma as unknown as import('@prisma/client').PrismaClient,
          'player-a2-strong',
          redis as unknown as import('ioredis').default,
        );

        expect(result.playerWon).toBe(true);

        // With streak = 0, bonusCoins = 0 → full SIM_PVP_WIN_COINS awarded
        const expectedCoins = SIM_PVP_WIN_COINS + result.streak.bonusCoins;
        expect(result.coinsGained).toBe(expectedCoins);

        // XP is always awarded
        expect(result.xpGained).toBeGreaterThan(0);
      },
    );

    it(
      'Redis incrby is called with cappedCoins when cappedCoins > 0 (counter is updated)',
      async () => {
        /**
         * **Validates: Requirements 2.7, 2.8**
         *
         * The daily accumulator must be incremented by the actual capped amount,
         * not the raw coinsGained. This ensures the cap is correctly tracked.
         */
        const { prisma } = buildStrongPlayerPrismaMock();
        const redis = buildRedisMock(0);

        const { runSimulatedPvP } = await import('../systems/pvp-sim');

        const result = await runSimulatedPvP(
          prisma as unknown as import('@prisma/client').PrismaClient,
          'player-a2-strong',
          redis as unknown as import('ioredis').default,
        );

        expect(result.playerWon).toBe(true);
        expect(result.coinsGained).toBeGreaterThan(0);

        // incrby must have been called with the capped amount
        expect(redis.incrby).toHaveBeenCalledWith(
          expect.stringContaining('duel:daily:player-a2-strong:'),
          result.coinsGained,
        );

        // expire must have been set (25-hour TTL)
        expect(redis.expire).toHaveBeenCalledWith(
          expect.stringContaining('duel:daily:player-a2-strong:'),
          25 * 60 * 60,
        );
      },
    );

    it(
      'Redis incrby is NOT called when cappedCoins = 0 (cap already reached)',
      async () => {
        /**
         * **Validates: Requirements 2.7, 2.8**
         *
         * When the cap is already reached, there is nothing to increment.
         * The Redis counter must not be updated with a zero value.
         */
        const { prisma } = buildStrongPlayerPrismaMock();
        const redis = buildRedisMock(500);

        const { runSimulatedPvP } = await import('../systems/pvp-sim');

        const result = await runSimulatedPvP(
          prisma as unknown as import('@prisma/client').PrismaClient,
          'player-a2-strong',
          redis as unknown as import('ioredis').default,
        );

        expect(result.playerWon).toBe(true);
        expect(result.coinsGained).toBe(0);

        // incrby must NOT be called when cappedCoins = 0
        expect(redis.incrby).not.toHaveBeenCalled();
        expect(redis.expire).not.toHaveBeenCalled();
      },
    );

    it(
      'prisma.player.update is called with cappedCoins (not raw coinsGained)',
      async () => {
        /**
         * **Validates: Requirements 2.7, 2.8**
         *
         * The DB update must use the capped coin value, not the raw reward.
         * With dailyEarned = 499, only 1 coin should be credited to the player.
         */
        const { prisma } = buildStrongPlayerPrismaMock();
        const redis = buildRedisMock(499);

        const { runSimulatedPvP } = await import('../systems/pvp-sim');

        const result = await runSimulatedPvP(
          prisma as unknown as import('@prisma/client').PrismaClient,
          'player-a2-strong',
          redis as unknown as import('ioredis').default,
        );

        expect(result.playerWon).toBe(true);
        expect(result.coinsGained).toBe(1);

        // The player.update call must use { increment: 1 } for coins
        const updateCall = prisma.player.update.mock.calls[0]?.[0];
        expect(updateCall).toBeDefined();
        expect(updateCall.data.coins).toEqual({ increment: 1 });
      },
    );
  });
});
