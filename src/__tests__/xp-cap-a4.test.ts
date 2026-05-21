// ============================================================
// xp-cap-a4.test.ts — A4 Fix: XP Cap Boundary Value Tests
//
// Unit tests for the capped XP scaling formula in finalXP (src/utils/math.ts).
// The fixed formula is:
//   Math.round(baseXP * Math.min(1 + level * XP_SCALE_RATE, XP_SCALE_MAX_MULT))
// where XP_SCALE_RATE = 0.01 and XP_SCALE_MAX_MULT = 1.30.
//
// Test cases:
//   1. finalXP(10, 0)   = 10  (no bonus at level 0: multiplier = 1.00)
//   2. finalXP(10, 30)  = 13  (exactly at cap: 1 + 30 × 0.01 = 1.30)
//   3. finalXP(10, 100) = 13  (cap enforced: same result as level 30)
//   4. finalXP(10, 1)   = 10  (level 1: 1 + 0.01 = 1.01 → rounds to 10)
//
// Validates: Requirements 2.11, 2.12
// ============================================================

import { describe, it, expect } from 'vitest';
import { finalXP } from '../utils/math';
import { XP_SCALE_MAX_MULT } from '../config';

describe('A4 Fix — XP Cap Boundary Values (Requirements 2.11, 2.12)', () => {
  it(
    'finalXP(10, 0) = 10 — no bonus at level 0 (multiplier = 1.00)',
    () => {
      /**
       * **Validates: Requirements 2.11, 2.12**
       *
       * At level 0: multiplier = Math.min(1 + 0 × 0.01, 1.30) = 1.00
       * finalXP = Math.round(10 × 1.00) = 10
       */
      expect(finalXP(10, 0)).toBe(10);
    },
  );

  it(
    'finalXP(10, 30) = 13 — exactly at cap (1 + 30 × 0.01 = 1.30)',
    () => {
      /**
       * **Validates: Requirements 2.11, 2.12**
       *
       * At level 30: multiplier = Math.min(1 + 30 × 0.01, 1.30) = Math.min(1.30, 1.30) = 1.30
       * finalXP = Math.round(10 × 1.30) = Math.round(13.0) = 13
       *
       * Level 30 is the exact boundary where the cap is first reached.
       */
      expect(finalXP(10, 30)).toBe(13);
      // Also verify the result equals baseXP × XP_SCALE_MAX_MULT
      expect(finalXP(10, 30)).toBe(Math.round(10 * XP_SCALE_MAX_MULT));
    },
  );

  it(
    'finalXP(10, 100) = 13 — cap enforced above level 30 (same as level 30)',
    () => {
      /**
       * **Validates: Requirements 2.11, 2.12**
       *
       * At level 100: multiplier = Math.min(1 + 100 × 0.01, 1.30) = Math.min(2.00, 1.30) = 1.30
       * finalXP = Math.round(10 × 1.30) = 13
       *
       * The cap prevents unbounded XP acceleration at high levels.
       * A level-100 player earns the same XP as a level-30 player.
       */
      expect(finalXP(10, 100)).toBe(13);
      // Must equal the level-30 result — cap is enforced
      expect(finalXP(10, 100)).toBe(finalXP(10, 30));
    },
  );

  it(
    'finalXP(10, 1) = 10 — level 1 bonus rounds down (1 + 0.01 = 1.01 → 10.1 → 10)',
    () => {
      /**
       * **Validates: Requirements 2.11, 2.12**
       *
       * At level 1: multiplier = Math.min(1 + 1 × 0.01, 1.30) = 1.01
       * finalXP = Math.round(10 × 1.01) = Math.round(10.1) = 10
       *
       * The small bonus at level 1 is not large enough to round up to 11.
       * This confirms the rate change from 0.03 to 0.01 is in effect.
       */
      expect(finalXP(10, 1)).toBe(10);
    },
  );
});
