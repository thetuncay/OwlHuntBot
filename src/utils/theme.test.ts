// Theme utility tests
// Task 2.1: Format helper unit tests
// Task 3.1–3.4: Property-based tests for bar functions and toSuperscript

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  errLine,
  okLine,
  warnLine,
  pipeLine,
  sectionTitle,
  hpBar,
  chargeBar,
  slotBar,
  hpBarColored,
  toSuperscript,
} from './theme';

// ─── Format Helper Unit Tests (Task 2.1) ──────────────────────────────────────

describe('format helpers', () => {
  it('errLine prefixes with ✗', () => {
    expect(errLine('test')).toBe('✗ test');
  });

  it('okLine prefixes with ✓', () => {
    expect(okLine('test')).toBe('✓ test');
  });

  it('warnLine prefixes with ⚠', () => {
    expect(warnLine('test')).toBe('⚠ test');
  });

  it('pipeLine prefixes with 🌙 |', () => {
    expect(pipeLine('test')).toBe('🌙 | test');
  });

  it('sectionTitle wraps title with ═ characters', () => {
    const result = sectionTitle('Title');
    expect(result).toContain('Title');
    expect(result).toMatch(/^═+/);
    expect(result).toMatch(/═+$/);
  });
});

// ─── Property-Based Tests (Tasks 3.1–3.4) ────────────────────────────────────

describe('bar function property tests', () => {

  /**
   * Property 1: Bar Dolu Segment Round-Trip
   * Validates: Requirements 2.1, 9.4
   *
   * hpBar(current, max, length) — dolu '█' sayısı
   * Math.round(clamp(current/max) * length) ile eşleşmeli
   */
  it('Property 1: hpBar filled segment count matches expected ratio (round-trip)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0 }),
        fc.integer({ min: 1 }),
        fc.integer({ min: 1, max: 20 }),
        (current: number, max: number, length: number) => {
          const result = hpBar(current, max, length);
          const filled = (result.match(/█/g) ?? []).length;
          const expected = Math.round(Math.min(Math.max(current / max, 0), 1) * length);
          return filled === expected;
        }
      )
    );
  });

  /**
   * Property 2: Overflow ve Underflow Sınır Koşulları
   * Validates: Requirements 2.10, 2.11
   *
   * current > max → bar yalnızca '█' veya '▰' içermeli
   * max === 0     → bar yalnızca '░' veya '▱' içermeli
   */
  it('Property 2: hpBar with current > max returns full bar (only █)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1 }),
        fc.integer({ min: 1 }),
        (extra: number, max: number) => {
          const current = max + extra;
          const result = hpBar(current, max);
          return !result.includes('░');
        }
      )
    );
  });

  it('Property 2: hpBar with max === 0 returns empty bar (only ░)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0 }),
        (current: number) => {
          const result = hpBar(current, 0);
          return !result.includes('█');
        }
      )
    );
  });

  it('Property 2: chargeBar with current > max returns full bar (only ▰)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1 }),
        fc.integer({ min: 1 }),
        (extra: number, max: number) => {
          const current = max + extra;
          const result = chargeBar(current, max);
          return !result.includes('▱');
        }
      )
    );
  });

  it('Property 2: chargeBar with max === 0 returns empty bar (only ▱)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0 }),
        (current: number) => {
          const result = chargeBar(current, 0);
          return !result.includes('▰');
        }
      )
    );
  });

  it('Property 2: slotBar with current > total returns full bar (only █)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1 }),
        fc.integer({ min: 1 }),
        (extra: number, total: number) => {
          const used = total + extra;
          const result = slotBar(used, total);
          // slotBar output: `████████` used/total — check bar portion inside backticks
          const barMatch = result.match(/`([^`]+)`/);
          if (!barMatch || barMatch[1] === undefined) return false;
          return !barMatch[1].includes('░');
        }
      )
    );
  });

  it('Property 2: slotBar with total === 0 returns empty bar (only ░)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0 }),
        (used: number) => {
          const result = slotBar(used, 0);
          // slotBar output: `░░░░░░░░░░` used/0 — check bar portion inside backticks
          const barMatch = result.match(/`([^`]+)`/);
          if (!barMatch || barMatch[1] === undefined) return false;
          return !barMatch[1].includes('█');
        }
      )
    );
  });

  /**
   * Property 3: hpBarColored Renk Eşiği
   * Validates: Requirements 2.7, 2.8, 2.9
   *
   * hp/hpMax > 0.5       → result includes '🟩'
   * 0.25 < ratio ≤ 0.5   → result includes '🟨'
   * ratio ≤ 0.25         → result includes '🟥'
   */
  it('Property 3: hpBarColored returns correct color indicator based on ratio', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }),
        fc.integer({ min: 1, max: 1000 }),
        (hp: number, hpMax: number) => {
          const ratio = hp / hpMax;
          const result = hpBarColored(hp, hpMax);
          if (ratio > 0.5) return result.includes('🟩');
          if (ratio > 0.25) return result.includes('🟨');
          return result.includes('🟥');
        }
      )
    );
  });

  /**
   * Property 5: hpBar Çıktı Uzunluğu
   * Validates: Requirements 3.6
   *
   * hpBar(current, target, 10) her zaman tam olarak 10 karakter uzunluğunda string döndürür.
   * ∀ (current, target) where 0 ≤ current < target ∧ target > 0
   */
  it('Property 5: hpBar always returns a string of exactly 10 characters', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }).chain((target: number) =>
          fc.tuple(fc.constant(target), fc.integer({ min: 0, max: target - 1 }))
        ),
        ([target, current]: [number, number]) => {
          const result = hpBar(current, target, 10);
          return [...result].length === 10;
        }
      )
    );
  });

  /**
   * Property 6: hpBar Dolu Segment Sayısı
   * Validates: Requirements 3.7
   *
   * hpBar(current, target, 10) içindeki '█' sayısı Math.round((current / target) * 10) ile eşit olmalı.
   * ∀ (current, target) where 0 ≤ current ≤ target ∧ target > 0
   */
  it('Property 6: hpBar filled segment count equals Math.round((current/target)*10)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }).chain((target: number) =>
          fc.tuple(fc.constant(target), fc.integer({ min: 0, max: target }))
        ),
        ([target, current]: [number, number]) => {
          const result = hpBar(current, target, 10);
          const filled = (result.match(/█/g) ?? []).length;
          const expected = Math.round((current / target) * 10);
          return filled === expected;
        }
      )
    );
  });

  /**
   * Property 7: hpBar Yalnızca Geçerli Karakterler
   * Validates: Requirements 3.6
   *
   * hpBar çıktısı yalnızca '█' ve '░' karakterlerinden oluşur.
   * ∀ (current, target) where 0 ≤ current ≤ target ∧ target > 0
   */
  it('Property 7: hpBar output consists only of █ and ░ characters', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 1000 }).chain((target: number) =>
          fc.tuple(fc.constant(target), fc.integer({ min: 0, max: target }))
        ),
        ([target, current]: [number, number]) => {
          const result = hpBar(current, target, 10);
          return /^[█░]+$/.test(result);
        }
      )
    );
  });

  /**
   * Property 4: toSuperscript Geçerlilik ve Sınır
   * Validates: Requirements 6.1, 6.3, 6.4, 6.5
   *
   * - Always exactly 2 characters long
   * - Each character must be from ['⁰','¹','²','³','⁴','⁵','⁶','⁷','⁸','⁹']
   * - n > 99 → '⁹⁹'
   * - n === 0 → '⁰⁰'
   */
  it('Property 4: toSuperscript returns valid 2-char superscript string', () => {
    const SUP_SET = new Set(['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹']);

    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 200 }),
        (n: number) => {
          const result = toSuperscript(n);

          // n > 99 → must return '⁹⁹'
          if (n > 99) return result === '⁹⁹';

          // n === 0 → must return '⁰⁰'
          if (n === 0) return result === '⁰⁰';

          // Always exactly 2 characters
          const chars = [...result];
          if (chars.length !== 2) return false;

          // Each character must be a valid superscript digit
          return chars.every((c) => SUP_SET.has(c));
        }
      )
    );
  });
});
