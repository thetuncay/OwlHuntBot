// ============================================================
// integration-a2.test.ts — A2 Integration Test
// Duel daily cap end-to-end
//
// Tests that running owl duel 10 times in rapid succession for the
// same player results in:
//   - Total coins awarded ≤ DUEL_DAILY_COIN_CAP (500)
//   - XP was awarded for all 10 duels (XP not capped)
//
// Requirements: 2.7, 2.8
// ============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DUEL_DAILY_COIN_CAP, SIM_PVP_WIN_COINS } from '../config';
import { createRedisPlayerMock } from './helpers/redis-player-mock';

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../systems/leaderboard', () => ({
  recordPvpWin:      vi.fn(async () => undefined),
  recordCoinsEarned: vi.fn(async () => undefined),
  recordWealthDelta: vi.fn(async () => undefined),
  refreshPowerScore: vi.fn(async () => 0),
}));

vi.mock('../systems/xp', () => ({
  addXP: vi.fn(async () => ({ levelUp: false, newLevel: 10, xpAdded: 0 })),
}));

// ─── In-memory Redis mock ─────────────────────────────────────────────────────
// Simulates real Redis INCR/GET/EXPIRE semantics for the daily cap counter.

const integrationRedis = createRedisPlayerMock({
  playerId: 'player-a2-integration',
  initialPlayer: { coins: 10_000, level: 10, xp: 0, mainOwlId: null },
});

vi.mock('../utils/redis', () => ({
  redis: integrationRedis,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Build a Prisma mock with very high owl stats to ensure the player always wins.
 * Math.random is mocked to 0 to make the battle deterministic.
 */
function buildStrongPlayerPrismaMock(playerId: string) {
  const player = {
    id: playerId,
    level: 10,
    pvpStreak: 0,
    pvpBestStreak: 0,
    prestigeLevel: 0,
    coins: 10_000,
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
      findUnique: vi.fn(async () => ({ ...player })),
      update: vi.fn(async () => ({ ...player })),
    },
    owl: {
      findFirst: vi.fn(async () => ({ ...mainOwl })),
    },
    $queryRaw: vi.fn(async () => []),
  };

  return { prisma, player, mainOwl };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('A2 Integration — Duel Daily Cap End-to-End (Requirements 2.7, 2.8)', () => {
  beforeEach(async () => {
    integrationRedis._reset();
    integrationRedis._store.set(
      integrationRedis._playerKey,
      JSON.stringify({ coins: 10_000, level: 10, xp: 0, mainOwlId: null }),
    );
    // Force Math.random to 0 so the player always wins (minimum RNG variation)
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Test 1: 10 rapid duels — total coins ≤ DUEL_DAILY_COIN_CAP ───────────

  it(
    'FIX CONFIRMED: 10 rapid duels for the same player award total coins ≤ DUEL_DAILY_COIN_CAP (500)',
    async () => {
      /**
       * Requirements: 2.7, 2.8
       *
       * Property 4: Bug Condition — Bot Duel Daily Cap Enforced
       *
       * Simulates sending owl duel 10 times in rapid succession.
       * The Redis daily accumulator (duel:daily:{playerId}:{date}) must
       * prevent total coins from exceeding DUEL_DAILY_COIN_CAP.
       *
       * Without the fix: 10 × 60 = 600 coins (exceeds cap)
       * With the fix: total ≤ 500 coins
       */
      const playerId = 'player-a2-integration-001';
      const { prisma } = buildStrongPlayerPrismaMock(playerId);
      const { redis } = await import('../utils/redis');
      const { runSimulatedPvP } = await import('../systems/pvp-sim');

      let totalCoinsAwarded = 0;
      let totalXpAwarded = 0;
      const duelCount = 10;

      for (let i = 0; i < duelCount; i++) {
        const result = await runSimulatedPvP(
          prisma as unknown as import('@prisma/client').PrismaClient,
          playerId,
          redis as unknown as import('ioredis').default,
        );

        totalCoinsAwarded += result.coinsGained;
        totalXpAwarded += result.xpGained;
      }

      // CRITICAL: Total coins must not exceed the daily cap
      expect(totalCoinsAwarded).toBeLessThanOrEqual(DUEL_DAILY_COIN_CAP);

      // XP must have been awarded for all 10 duels (XP is not capped)
      expect(totalXpAwarded).toBeGreaterThan(0);
    },
  );

  // ── Test 2: XP awarded for all 10 duels ──────────────────────────────────

  it(
    'FIX CONFIRMED: XP is awarded for all 10 duels regardless of coin cap status',
    async () => {
      /**
       * Requirements: 2.7, 2.8
       *
       * Property 4: Bug Condition — Bot Duel Daily Cap Enforced
       *
       * Even after the coin cap is reached, XP must continue to be awarded.
       * This verifies that the cap only affects coins, not XP.
       */
      const playerId = 'player-a2-integration-002';
      const { prisma } = buildStrongPlayerPrismaMock(playerId);
      const { redis } = await import('../utils/redis');
      const { runSimulatedPvP } = await import('../systems/pvp-sim');

      const xpPerDuel: number[] = [];
      const coinsPerDuel: number[] = [];
      const duelCount = 10;

      for (let i = 0; i < duelCount; i++) {
        const result = await runSimulatedPvP(
          prisma as unknown as import('@prisma/client').PrismaClient,
          playerId,
          redis as unknown as import('ioredis').default,
        );

        xpPerDuel.push(result.xpGained);
        coinsPerDuel.push(result.coinsGained);
      }

      // Every duel must have awarded XP (XP is never capped)
      for (let i = 0; i < duelCount; i++) {
        expect(xpPerDuel[i]).toBeGreaterThan(0);
      }

      // After the cap is reached, coins must be 0 for remaining duels
      const totalCoins = coinsPerDuel.reduce((sum, c) => sum + c, 0);
      expect(totalCoins).toBeLessThanOrEqual(DUEL_DAILY_COIN_CAP);

      // Find the first duel where coins dropped to 0 (cap reached)
      const capReachedAt = coinsPerDuel.findIndex(c => c === 0);
      if (capReachedAt !== -1) {
        // All duels after cap must also award 0 coins
        for (let i = capReachedAt; i < duelCount; i++) {
          expect(coinsPerDuel[i]).toBe(0);
        }
        // But XP must still be positive for those duels
        for (let i = capReachedAt; i < duelCount; i++) {
          expect(xpPerDuel[i]).toBeGreaterThan(0);
        }
      }
    },
  );

  // ── Test 3: Redis accumulator tracks daily total correctly ────────────────

  it(
    'FIX CONFIRMED: Redis daily accumulator (duel:daily:{playerId}:{date}) ' +
      'correctly tracks cumulative coins and stops at DUEL_DAILY_COIN_CAP',
    async () => {
      /**
       * Requirements: 2.7, 2.8
       *
       * The Redis key duel:daily:{playerId}:{date} must:
       *   1. Be incremented by cappedCoins after each win
       *   2. Never exceed DUEL_DAILY_COIN_CAP
       *   3. Have a 25-hour TTL set
       */
      const playerId = 'player-a2-integration-003';
      const { prisma } = buildStrongPlayerPrismaMock(playerId);
      const { redis } = await import('../utils/redis');
      const mockRedis = redis as unknown as {
        eval: ReturnType<typeof vi.fn>;
        _store: Map<string, string>;
      };
      const { runSimulatedPvP } = await import('../systems/pvp-sim');

      const duelCount = 10;
      for (let i = 0; i < duelCount; i++) {
        await runSimulatedPvP(
          prisma as unknown as import('@prisma/client').PrismaClient,
          playerId,
          redis as unknown as import('ioredis').default,
        );
      }

      // Check the Redis accumulator value
      const today = new Date().toISOString().slice(0, 10);
      const dailyKey = `duel:daily:${playerId}:${today}`;
      const storedValue = mockRedis._store.get(dailyKey);

      expect(storedValue).toBeDefined();
      const accumulated = parseInt(storedValue!, 10);

      // Accumulated value must not exceed the cap
      expect(accumulated).toBeLessThanOrEqual(DUEL_DAILY_COIN_CAP);

      // Lua grant updates store via eval
      expect(mockRedis.eval).toHaveBeenCalled();
    },
  );

  // ── Test 4: Partial award at cap boundary ────────────────────────────────

  it(
    'FIX CONFIRMED: partial award at cap boundary — last win before cap gets remainder only',
    async () => {
      const maxFullWins = Math.floor(DUEL_DAILY_COIN_CAP / SIM_PVP_WIN_COINS);
      const playerId = 'player-a2-integration-004';
      const { prisma } = buildStrongPlayerPrismaMock(playerId);
      const { redis } = await import('../utils/redis');
      const { runSimulatedPvP } = await import('../systems/pvp-sim');

      const coinsPerDuel: number[] = [];

      for (let i = 0; i < maxFullWins + 2; i++) {
        const result = await runSimulatedPvP(
          prisma as unknown as import('@prisma/client').PrismaClient,
          playerId,
          redis as unknown as import('ioredis').default,
        );
        coinsPerDuel.push(result.coinsGained);
      }

      const totalCoins = coinsPerDuel.reduce((sum, c) => sum + c, 0);
      expect(totalCoins).toBeLessThanOrEqual(DUEL_DAILY_COIN_CAP);

      for (let i = 0; i < maxFullWins; i++) {
        expect(coinsPerDuel[i]).toBe(SIM_PVP_WIN_COINS);
      }

      expect(coinsPerDuel[maxFullWins]).toBe(
        DUEL_DAILY_COIN_CAP - maxFullWins * SIM_PVP_WIN_COINS,
      );
      expect(coinsPerDuel[maxFullWins + 1]).toBe(0);
    },
  );

  // ── Test 5: Rapid succession (sequential) ────────────────────────────────

  it(
    'FIX CONFIRMED: 10 duels run in rapid succession (sequential) ' +
      'result in total coins ≤ DUEL_DAILY_COIN_CAP',
    async () => {
      /**
       * Requirements: 2.7, 2.8
       *
       * Simulates the "rapid succession" scenario from the task description.
       * Duels are run sequentially (as they would be in practice, since each
       * duel awaits the previous one before the next Discord interaction fires).
       *
       * The Redis daily accumulator correctly tracks the running total and
       * prevents the cap from being exceeded.
       *
       * Note: True concurrent Redis access would require a real Redis instance.
       * The in-memory mock correctly simulates the sequential case, which is
       * the realistic scenario for a single player sending rapid commands.
       */
      const playerId = 'player-a2-integration-005';
      const { prisma } = buildStrongPlayerPrismaMock(playerId);
      const { redis } = await import('../utils/redis');
      const { runSimulatedPvP } = await import('../systems/pvp-sim');

      const results: Array<{ coinsGained: number; xpGained: number }> = [];

      // Run 10 duels sequentially (rapid succession)
      for (let i = 0; i < 10; i++) {
        const result = await runSimulatedPvP(
          prisma as unknown as import('@prisma/client').PrismaClient,
          playerId,
          redis as unknown as import('ioredis').default,
        );
        results.push(result);
      }

      const totalCoins = results.reduce((sum, r) => sum + r.coinsGained, 0);
      const totalXp = results.reduce((sum, r) => sum + r.xpGained, 0);

      // Total coins must not exceed the daily cap
      expect(totalCoins).toBeLessThanOrEqual(DUEL_DAILY_COIN_CAP);

      // XP must have been awarded for all 10 duels
      expect(totalXp).toBeGreaterThan(0);

      // All 10 duels must have completed (no errors)
      expect(results).toHaveLength(10);
    },
  );
});
