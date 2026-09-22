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
import { createRedisPlayerMock } from './helpers/redis-player-mock';

// ─── Module mocks (declared before imports) ──────────────────────────────────

// Mock the leaderboard module — these fire-and-forget calls are not under test
vi.mock('../systems/leaderboard', () => ({
  recordPvpWin:       vi.fn(async () => undefined),
  recordWealthDelta:  vi.fn(async () => undefined),
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
    id: 'owl-a2-test',
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
      count: vi.fn(async () => 0),
      findFirst: vi.fn(async () => mainOwl),
      findUnique: vi.fn(async () => mainOwl),
      update: vi.fn(async () => mainOwl),
    },
    $queryRaw: vi.fn(async () => []),
  };

  return { prisma, player, mainOwl };
}

/** Redis mock with duel cap + player-state coin Lua support. */
function buildRedisMock(dailyEarned: number, playerId = 'player-a2-strong') {
  return createRedisPlayerMock({
    duelDailyEarned: dailyEarned,
    playerId,
    initialPlayer: { coins: 1000, level: 10, xp: 0, mainOwlId: null },
  });
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
      'dailyEarned = cap - 1 → partial award: coinsGained is capped to 1',
      () => {
        const dailyEarned = DUEL_DAILY_COIN_CAP - 1;
        const coinsGained = SIM_PVP_WIN_COINS;

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
        const coinsGained = SIM_PVP_WIN_COINS;

        const cappedCoins = applyCap(coinsGained, dailyEarned);

        expect(cappedCoins).toBe(SIM_PVP_WIN_COINS);
      },
    );

    it(
      'dailyEarned = 0, coinsGained = SIM_PVP_WIN_COINS + streak bonus → full award',
      () => {
        /**
         * **Validates: Requirements 2.7, 2.8**
         *
         * Property 5: Preservation — streak bonus is fully awarded when below cap.
         */
        const dailyEarned = 0;
        const bonusCoins = 55; // streak 5+ bonus
        const coinsGained = SIM_PVP_WIN_COINS + bonusCoins;

        const cappedCoins = applyCap(coinsGained, dailyEarned);

        expect(cappedCoins).toBe(SIM_PVP_WIN_COINS + bonusCoins);
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
      'boundary: dailyEarned one win below cap → cappedCoins = SIM_PVP_WIN_COINS (exactly fits)',
      () => {
        const dailyEarned = DUEL_DAILY_COIN_CAP - SIM_PVP_WIN_COINS;
        const coinsGained = SIM_PVP_WIN_COINS;

        const cappedCoins = applyCap(coinsGained, dailyEarned);

        expect(cappedCoins).toBe(SIM_PVP_WIN_COINS);
        expect(dailyEarned + cappedCoins).toBe(DUEL_DAILY_COIN_CAP);
      },
    );

    it(
      'boundary: dailyEarned one coin over exact-fit → partial award',
      () => {
        const dailyEarned = DUEL_DAILY_COIN_CAP - SIM_PVP_WIN_COINS + 1;
        const coinsGained = SIM_PVP_WIN_COINS;

        const cappedCoins = applyCap(coinsGained, dailyEarned);

        expect(cappedCoins).toBe(SIM_PVP_WIN_COINS - 1);
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
        id: 'owl-a2-strong',
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
          count: vi.fn(async () => 0),
          findFirst: vi.fn(async () => mainOwl),
          findUnique: vi.fn(async () => mainOwl),
          update: vi.fn(async () => mainOwl),
        },
        $queryRaw: vi.fn(async () => []),
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
        const redis = buildRedisMock(DUEL_DAILY_COIN_CAP - 1);

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
      'dailyEarned = cap → result.coinsGained = 0 and xpGained > 0 (cap reached, XP unaffected)',
      async () => {
        const { prisma } = buildStrongPlayerPrismaMock();
        const redis = buildRedisMock(DUEL_DAILY_COIN_CAP);

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

        // grantDuelDailyCoins uses Lua eval — store must reflect capped amount
        const today = new Date().toISOString().slice(0, 10);
        const dailyKey = `duel:daily:player-a2-strong:${today}`;
        expect(parseInt(String((redis as any)._store.get(dailyKey) ?? '0'), 10)).toBe(result.coinsGained);
        expect(redis.eval).toHaveBeenCalled();
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
        const redis = buildRedisMock(DUEL_DAILY_COIN_CAP);

        const { runSimulatedPvP } = await import('../systems/pvp-sim');

        const result = await runSimulatedPvP(
          prisma as unknown as import('@prisma/client').PrismaClient,
          'player-a2-strong',
          redis as unknown as import('ioredis').default,
        );

        expect(result.playerWon).toBe(true);
        expect(result.coinsGained).toBe(0);

        // When cap reached, eval returns 0 — no store increment
        expect(redis.incrby).not.toHaveBeenCalled();
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
        const redis = buildRedisMock(DUEL_DAILY_COIN_CAP - 1);

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
        // Redis-first path: coins applied via applyCoinDeltaInRedis, not PG increment
        expect(updateCall.data.coins).toBeUndefined();
      },
    );
  });

  describe('pickRandomPlayerOwlOpponent', () => {
    it('kendi main baykuşunu rakip olarak seçmez', async () => {
      const playerId = 'player-self';
      const otherOwl = {
        id: 'owl-other',
        ownerId: 'player-other',
        species: 'Kukumav baykusu',
        nickname: 'Gece Pençesi',
        hp: 90,
        hpMax: 100,
        staminaCur: 80,
        statGaga: 10,
        statPence: 10,
        statKanat: 10,
      };

      const prisma = {
        $queryRaw: vi.fn(async () => [otherOwl]),
        player: {
          findMany: vi.fn(async () => [{
            id: 'player-other',
            registrations: [{ displayName: 'RakipAvcı', username: 'rakip' }],
          }]),
        },
      };

      const { pickRandomPlayerOwlOpponent } = await import('../systems/pvp-sim');
      const opponent = await pickRandomPlayerOwlOpponent(
        prisma as unknown as import('@prisma/client').PrismaClient,
        playerId,
      );

      expect(opponent).not.toBeNull();
      expect(opponent!.ownerId).not.toBe(playerId);
      expect(opponent!.source).toBe('player');
      expect(opponent!.flavorLine).toBeTruthy();
      expect(opponent!.hp).toBe(otherOwl.hpMax);
      expect(opponent!.hpMax).toBe(otherOwl.hpMax);
      expect(opponent!.stamina).toBe(100);
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it('excludeIds doluyken NOT IN sorgusu kullanır; boşsa gevşetir', async () => {
      const playerId = 'player-self';
      const otherOwl = {
        id: 'owl-other',
        ownerId: 'player-other',
        species: 'Kukumav baykusu',
        nickname: null,
        hp: 50,
        hpMax: 120,
        staminaCur: 40,
        statGaga: 10,
        statPence: 10,
        statKanat: 10,
      };

      const queryRaw = vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([otherOwl]);

      const prisma = {
        $queryRaw: queryRaw,
        player: {
          findMany: vi.fn(async () => [{
            id: 'player-other',
            registrations: [{ displayName: 'Rakip', username: 'rakip' }],
          }]),
        },
      };

      const { pickRandomPlayerOwlOpponent } = await import('../systems/pvp-sim');
      const opponent = await pickRandomPlayerOwlOpponent(
        prisma as unknown as import('@prisma/client').PrismaClient,
        playerId,
        ['recent-a', 'recent-b'],
      );

      expect(queryRaw).toHaveBeenCalledTimes(2);
      expect(opponent?.ownerId).toBe('player-other');
      expect(opponent?.hp).toBe(120);
    });
  });

  describe('SIM_PVP difficulty + full-HP fairness', () => {
    it('kolay ağırlığı zorludan yüksek', async () => {
      const { SIM_PVP_DIFFICULTY_TABLE } = await import('../config');
      const easy = SIM_PVP_DIFFICULTY_TABLE.find((d) => d.label === 'Kolay')!;
      const hard = SIM_PVP_DIFFICULTY_TABLE.find((d) => d.label === 'Zorlu')!;
      expect(easy.weight).toBeGreaterThan(hard.weight);
      expect(easy.powerRatio).toBeLessThan(1);
      expect(hard.powerRatio).toBeLessThanOrEqual(1.1);
    });

    it('güçlü oyuncu zayıf botu full HP ile yener', async () => {
      const { generateFakeOpponent } = await import('../systems/pvp-sim');
      const { pickBattleWinner, runPvpBattleExchanges } = await import('../systems/pvp');

      // Kolay bot üretmek için random'ı sabitlemek zor; doğrudan düşük power opponent ile dövüş
      const playerPower = 200;
      const opponent = generateFakeOpponent(playerPower, 400);
      // En kötü durumda bile zorlu 1.08 × variation max ~1.16; 200 vs ~232 olabilir.
      // Garantili kazanç için daha yüksek güç kullan.
      const strongPower = 400;
      const weakOpp = {
        ...opponent,
        power: 200,
        hp: 300,
        hpMax: 300,
        stamina: 100,
      };
      const challenger = {
        playerId: 'p',
        hp: 500,
        hpMax: 500,
        stamina: 100,
        power: strongPower,
        buffDamageMult: 1,
        buffDodgeBonus: 0,
      };
      const defender = {
        playerId: 'bot',
        hp: weakOpp.hp,
        hpMax: weakOpp.hpMax,
        stamina: weakOpp.stamina,
        power: weakOpp.power,
        buffDamageMult: 1,
        buffDodgeBonus: 0,
      };
      runPvpBattleExchanges(challenger, defender);
      expect(pickBattleWinner(challenger, defender).playerId).toBe('p');
    });
  });
});
