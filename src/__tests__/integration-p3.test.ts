// ============================================================
// integration-p3.test.ts — P3 Integration Test
// Tame session payload size
//
// Tests that:
//   1. The Redis payload size does not grow after the 50th interaction
//   2. usedLines.length = 50 throughout turns 51–60
//
// Requirements: 2.18, 2.19
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addUsedLine, updateTameSession } from '../systems/tame-session';
import type { TameSessionState } from '../systems/tame-session';
import { TAME_USED_LINES_MAX } from '../config';

// ─── In-memory Redis mock ─────────────────────────────────────────────────────

vi.mock('../utils/redis', () => {
  const store = new Map<string, string>();

  const redis = {
    set: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
      return 'OK';
    }),
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    del: vi.fn(async (key: string) => {
      const existed = store.has(key);
      store.delete(key);
      return existed ? 1 : 0;
    }),
    eval: vi.fn(async () => 0),
    incrby: vi.fn(async () => 0),
    expire: vi.fn(async () => 1),
    _store: store,
    _reset: () => store.clear(),
  };

  return { redis };
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSession(playerId: string, usedLines: string[] = []): TameSessionState {
  return {
    encounterId: 'enc-p3-integration',
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

/**
 * Get the serialised Redis payload size for a tame session.
 */
function getPayloadSize(store: Map<string, string>, playerId: string): number {
  const key = `tame_session:${playerId}`;
  const raw = store.get(key);
  return raw ? raw.length : 0;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('P3 Integration — Tame Session Payload Size (Requirements 2.18, 2.19)', () => {
  beforeEach(async () => {
    const { redis } = await import('../utils/redis');
    (redis as unknown as { _reset: () => void })._reset();
  });

  // ── Test 1: Payload size does not grow after the 50th interaction ─────────

  it(
    'FIX CONFIRMED: Redis payload size does not grow after the 50th button interaction',
    async () => {
      /**
       * Requirements: 2.18, 2.19
       *
       * Property 11: Bug Condition — Tame Session usedLines[] Capped at TAME_USED_LINES_MAX
       *
       * Simulates 60 button interactions (tame session turns).
       * After the 50th interaction, the payload size must stabilise —
       * it must not grow with each additional interaction.
       *
       * This verifies that the Redis I/O overhead is bounded regardless
       * of session duration.
       *
       * Note: We use fixed-length line names (padded to 3 digits) to ensure
       * consistent payload sizes across all turns.
       */
      const playerId = 'player-p3-integration-001';
      const { redis } = await import('../utils/redis');
      const mockRedis = redis as unknown as { _store: Map<string, string> };
      const state = makeSession(playerId);

      const payloadSizes: number[] = [];

      // Simulate 60 button interactions with fixed-length line names
      for (let i = 1; i <= 60; i++) {
        const line = `dialogue-line-${String(i).padStart(3, '0')}`; // fixed length
        addUsedLine(state, line);
        await updateTameSession(redis as unknown as import('ioredis').default, state);
        payloadSizes.push(getPayloadSize(mockRedis._store, playerId));
      }

      // Payload size at turn 50 (the cap boundary)
      const sizeAtTurn50 = payloadSizes[49]!;

      // Payload sizes for turns 51–60 must not exceed the size at turn 50
      for (let i = 50; i < 60; i++) {
        expect(payloadSizes[i]).toBeLessThanOrEqual(sizeAtTurn50);
      }

      // The payload must have stabilised (size at turn 60 ≤ size at turn 50)
      const sizeAtTurn60 = payloadSizes[59]!;
      expect(sizeAtTurn60).toBeLessThanOrEqual(sizeAtTurn50);
    },
  );

  // ── Test 2: usedLines.length = 50 throughout turns 51–60 ─────────────────

  it(
    'FIX CONFIRMED: usedLines.length = TAME_USED_LINES_MAX (50) throughout turns 51–60',
    async () => {
      /**
       * Requirements: 2.18, 2.19
       *
       * Property 11: Bug Condition — Tame Session usedLines[] Capped at TAME_USED_LINES_MAX
       *
       * After the 50th interaction, every subsequent interaction must maintain
       * usedLines.length at exactly TAME_USED_LINES_MAX (50).
       * The oldest entry is evicted to make room for the new one.
       */
      const playerId = 'player-p3-integration-002';
      const { redis } = await import('../utils/redis');
      const state = makeSession(playerId);

      // Simulate 60 button interactions
      for (let i = 1; i <= 60; i++) {
        addUsedLine(state, `dialogue-line-${i}`);
        await updateTameSession(redis as unknown as import('ioredis').default, state);

        // From turn 50 onwards, length must be exactly TAME_USED_LINES_MAX
        if (i >= TAME_USED_LINES_MAX) {
          expect(state.usedLines.length).toBe(TAME_USED_LINES_MAX);
        }
      }

      // Final state: exactly 50 entries
      expect(state.usedLines.length).toBe(TAME_USED_LINES_MAX);
    },
  );

  // ── Test 3: Redis payload matches in-memory state ─────────────────────────

  it(
    'FIX CONFIRMED: Redis payload reflects the capped usedLines[] array ' +
      '(stored JSON has usedLines.length = 50 after 60 interactions)',
    async () => {
      /**
       * Requirements: 2.18, 2.19
       *
       * The Redis payload must accurately reflect the in-memory state.
       * After 60 interactions, the stored JSON must have usedLines.length = 50.
       */
      const playerId = 'player-p3-integration-003';
      const { redis } = await import('../utils/redis');
      const mockRedis = redis as unknown as { _store: Map<string, string> };
      const state = makeSession(playerId);

      // Simulate 60 button interactions
      for (let i = 1; i <= 60; i++) {
        addUsedLine(state, `line-${i}`);
        await updateTameSession(redis as unknown as import('ioredis').default, state);
      }

      // Read the stored payload from Redis
      const sessionKey = `tame_session:${playerId}`;
      const storedRaw = mockRedis._store.get(sessionKey);
      expect(storedRaw).toBeDefined();

      const stored = JSON.parse(storedRaw!) as TameSessionState;

      // Stored usedLines must be capped at TAME_USED_LINES_MAX
      expect(stored.usedLines.length).toBe(TAME_USED_LINES_MAX);

      // The stored array must contain the LAST 50 lines (lines 11–60)
      expect(stored.usedLines[0]).toBe('line-11');
      expect(stored.usedLines[49]).toBe('line-60');
    },
  );

  // ── Test 4: Payload size comparison — before and after cap ───────────────

  it(
    'FIX CONFIRMED: payload size at turn 60 is the same as at turn 50 ' +
      '(no unbounded growth)',
    async () => {
      /**
       * Requirements: 2.18, 2.19
       *
       * The payload size must stabilise at the cap boundary.
       * Turns 51–60 must produce payloads of the same size as turn 50.
       *
       * We use fixed-length line names (padded to 3 digits) to ensure
       * consistent payload sizes across all turns.
       */
      const playerId = 'player-p3-integration-004';
      const { redis } = await import('../utils/redis');
      const mockRedis = redis as unknown as { _store: Map<string, string> };
      const state = makeSession(playerId);

      // Simulate up to turn 50 with fixed-length line names
      for (let i = 1; i <= 50; i++) {
        addUsedLine(state, `line-${String(i).padStart(3, '0')}`);
        await updateTameSession(redis as unknown as import('ioredis').default, state);
      }
      const sizeAtTurn50 = getPayloadSize(mockRedis._store, playerId);

      // Simulate turns 51–60 with fixed-length line names
      for (let i = 51; i <= 60; i++) {
        addUsedLine(state, `line-${String(i).padStart(3, '0')}`);
        await updateTameSession(redis as unknown as import('ioredis').default, state);
        const currentSize = getPayloadSize(mockRedis._store, playerId);

        // Payload size must not exceed the size at turn 50
        expect(currentSize).toBeLessThanOrEqual(sizeAtTurn50);
      }

      // Final size must equal the size at turn 50 (stable)
      const sizeAtTurn60 = getPayloadSize(mockRedis._store, playerId);
      expect(sizeAtTurn60).toBe(sizeAtTurn50);
    },
  );

  // ── Test 5: Oldest entry is evicted (FIFO eviction) ──────────────────────

  it(
    'FIX CONFIRMED: oldest entry is evicted when cap is reached ' +
      '(FIFO eviction — first-in, first-out)',
    async () => {
      /**
       * Requirements: 2.18, 2.19
       *
       * When the 51st line is added, the 1st line must be evicted.
       * When the 52nd line is added, the 2nd line must be evicted.
       * This is FIFO (oldest first) eviction.
       */
      const playerId = 'player-p3-integration-005';
      const { redis } = await import('../utils/redis');
      const state = makeSession(playerId);

      // Fill to exactly the cap
      for (let i = 1; i <= TAME_USED_LINES_MAX; i++) {
        addUsedLine(state, `line-${i}`);
      }
      await updateTameSession(redis as unknown as import('ioredis').default, state);

      // Verify: first entry is 'line-1', last is 'line-50'
      expect(state.usedLines[0]).toBe('line-1');
      expect(state.usedLines[TAME_USED_LINES_MAX - 1]).toBe(`line-${TAME_USED_LINES_MAX}`);

      // Add the 51st line — 'line-1' must be evicted
      addUsedLine(state, 'line-51');
      await updateTameSession(redis as unknown as import('ioredis').default, state);

      expect(state.usedLines.length).toBe(TAME_USED_LINES_MAX);
      expect(state.usedLines[0]).toBe('line-2'); // line-1 evicted
      expect(state.usedLines[TAME_USED_LINES_MAX - 1]).toBe('line-51');

      // Add the 52nd line — 'line-2' must be evicted
      addUsedLine(state, 'line-52');
      await updateTameSession(redis as unknown as import('ioredis').default, state);

      expect(state.usedLines.length).toBe(TAME_USED_LINES_MAX);
      expect(state.usedLines[0]).toBe('line-3'); // line-2 evicted
      expect(state.usedLines[TAME_USED_LINES_MAX - 1]).toBe('line-52');
    },
  );

  // ── Test 6: Payload size grows linearly up to cap, then stabilises ────────

  it(
    'FIX CONFIRMED: payload size grows for turns 1–50, ' +
      'then stabilises for turns 51–60',
    async () => {
      /**
       * Requirements: 2.18, 2.19
       *
       * Before the cap: each new line increases the payload size.
       * After the cap: payload size is constant (eviction keeps it bounded).
       *
       * We use fixed-length line names (padded to 3 digits) to ensure
       * consistent payload sizes across all turns.
       */
      const playerId = 'player-p3-integration-006';
      const { redis } = await import('../utils/redis');
      const mockRedis = redis as unknown as { _store: Map<string, string> };
      const state = makeSession(playerId);

      const payloadSizes: number[] = [];

      for (let i = 1; i <= 60; i++) {
        addUsedLine(state, `line-${String(i).padStart(3, '0')}`);
        await updateTameSession(redis as unknown as import('ioredis').default, state);
        payloadSizes.push(getPayloadSize(mockRedis._store, playerId));
      }

      // Turns 1–49: payload must grow (each new line adds bytes)
      for (let i = 1; i < 49; i++) {
        expect(payloadSizes[i]).toBeGreaterThan(payloadSizes[i - 1]!);
      }

      // Turns 50–60: payload must be stable (no growth)
      // With fixed-length line names, the size is exactly constant
      const sizeAtTurn50 = payloadSizes[49]!;
      for (let i = 50; i < 60; i++) {
        expect(payloadSizes[i]).toBe(sizeAtTurn50);
      }
    },
  );

  // ── Test 7: TAME_USED_LINES_MAX constant is 50 ───────────────────────────

  it(
    'FIX CONFIRMED: TAME_USED_LINES_MAX is 50 (config constant is set correctly)',
    () => {
      /**
       * Requirements: 2.18, 2.19
       *
       * Verifies the config constant is set to the correct value per the design spec.
       */
      expect(TAME_USED_LINES_MAX).toBe(50);
    },
  );
});
