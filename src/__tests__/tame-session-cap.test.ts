// ============================================================
// tame-session-cap.test.ts — Unit Tests for usedLines[] Cap (Task 10.3)
//
// Tests the eviction behaviour of addUsedLine() at the cap boundary.
//
// Validates: Requirements 2.18, 2.19
// ============================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addUsedLine } from '../systems/tame-session';
import type { TameSessionState } from '../systems/tame-session';
import { TAME_USED_LINES_MAX } from '../config';

// ─── Mock Redis ───────────────────────────────────────────────────────────────
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

// ─── Helper ───────────────────────────────────────────────────────────────────
function makeSession(playerId: string, usedLines: string[]): TameSessionState {
  return {
    encounterId: 'enc-test',
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('addUsedLine — eviction at cap boundary (Task 10.3)', () => {
  beforeEach(async () => {
    const { redis } = await import('../utils/redis');
    (redis as unknown as { _reset: () => void })._reset();
  });

  it(
    'FIX CONFIRMED: after 51 addUsedLine calls, usedLines.length = TAME_USED_LINES_MAX (50)',
    () => {
      /**
       * Validates: Requirements 2.18, 2.19
       *
       * Simulate 51 addUsedLine calls on an empty session.
       * After the 51st call, the oldest entry must be evicted,
       * keeping the array at exactly TAME_USED_LINES_MAX entries.
       */
      const state = makeSession('player-cap-test', []);

      for (let i = 1; i <= 51; i++) {
        addUsedLine(state, `line-${i}`);
      }

      // Array must be capped at TAME_USED_LINES_MAX
      expect(state.usedLines.length).toBe(TAME_USED_LINES_MAX);
      expect(state.usedLines.length).toBe(50);
    },
  );

  it(
    'FIX CONFIRMED: after 51 addUsedLine calls, the first entry is the second line added (oldest evicted)',
    () => {
      /**
       * Validates: Requirements 2.18, 2.19
       *
       * The first line added ("line-1") must be evicted when the 51st line is added.
       * The first entry in the array must be "line-2" (the second line added).
       */
      const state = makeSession('player-eviction-test', []);

      for (let i = 1; i <= 51; i++) {
        addUsedLine(state, `line-${i}`);
      }

      // First entry must be "line-2" (line-1 was evicted)
      expect(state.usedLines[0]).toBe('line-2');
    },
  );

  it(
    'FIX CONFIRMED: after 51 addUsedLine calls, the last entry is the 51st line added',
    () => {
      /**
       * Validates: Requirements 2.18, 2.19
       *
       * The last entry in the array must be the 51st line added.
       */
      const state = makeSession('player-last-test', []);

      for (let i = 1; i <= 51; i++) {
        addUsedLine(state, `line-${i}`);
      }

      // Last entry must be "line-51"
      expect(state.usedLines[state.usedLines.length - 1]).toBe('line-51');
    },
  );

  it(
    'PRESERVED: below cap — addUsedLine appends without eviction (length increases by 1)',
    () => {
      /**
       * Validates: Requirements 2.18, 2.19
       *
       * When usedLines.length < TAME_USED_LINES_MAX, addUsedLine must append
       * without evicting any entry.
       */
      const existingLines = Array.from({ length: 49 }, (_, i) => `existing-${i}`);
      const state = makeSession('player-below-cap', existingLines);

      addUsedLine(state, 'new-line');

      // Length must be 50 (49 + 1)
      expect(state.usedLines.length).toBe(50);
      // All existing lines preserved
      for (let i = 0; i < 49; i++) {
        expect(state.usedLines[i]).toBe(`existing-${i}`);
      }
      // New line appended at the end
      expect(state.usedLines[49]).toBe('new-line');
    },
  );

  it(
    'FIX CONFIRMED: at exactly cap (50 entries), adding one more evicts the oldest',
    () => {
      /**
       * Validates: Requirements 2.18, 2.19
       *
       * When usedLines.length = TAME_USED_LINES_MAX, adding one more line
       * must evict the oldest entry and keep length at TAME_USED_LINES_MAX.
       */
      const existingLines = Array.from({ length: 50 }, (_, i) => `line-${i}`);
      const state = makeSession('player-at-cap', existingLines);

      addUsedLine(state, 'new-line');

      // Length must remain at TAME_USED_LINES_MAX
      expect(state.usedLines.length).toBe(TAME_USED_LINES_MAX);
      // Oldest entry (line-0) must be evicted
      expect(state.usedLines[0]).toBe('line-1');
      // New line must be at the end
      expect(state.usedLines[state.usedLines.length - 1]).toBe('new-line');
    },
  );

  it(
    'FIX CONFIRMED: after 60 addUsedLine calls, usedLines.length = 50 (not 60)',
    () => {
      /**
       * Validates: Requirements 2.18, 2.19
       *
       * This mirrors the bug exploration test scenario: 60 turns should
       * result in exactly TAME_USED_LINES_MAX entries, not 60.
       */
      const state = makeSession('player-60-turns', []);

      for (let i = 1; i <= 60; i++) {
        addUsedLine(state, `dialogue-line-${i}`);
      }

      expect(state.usedLines.length).toBe(TAME_USED_LINES_MAX);
      expect(state.usedLines.length).toBe(50);
      // The last 50 lines (11-60) must be present
      expect(state.usedLines[0]).toBe('dialogue-line-11');
      expect(state.usedLines[49]).toBe('dialogue-line-60');
    },
  );
});
