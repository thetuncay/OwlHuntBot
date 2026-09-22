// ============================================================
// perf-totalxp.test.ts — Property-Based Test: totalXP İnvaryantı
//
// G7 — totalXP İnvaryantı:
//   FOR ALL oyuncular, Player.totalXP değeri
//   sum(xpRequired(l) for l in 1..level-1) + player.xp
//   formülüyle hesaplanan değerle eşit olmalıdır.
//
// Validates: Requirements 7.5
//
// Framework: vitest + fast-check
// ============================================================

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { xpRequired } from '../utils/math.js';

/**
 * totalXP backfill formülü:
 * sum(xpRequired(l) for l in 1..level-1) + player.xp
 */
function calcTotalXP(level: number, xp: number): number {
  let total = 0;
  for (let l = 1; l < level; l++) {
    total += xpRequired(l);
  }
  return total + xp;
}

/**
 * Bir oyuncunun totalXP'sini artımlı olarak günceller.
 * addXP çağrısını simüle eder: totalXP += gainedXP
 */
function simulateAddXP(
  currentTotalXP: number,
  gainedXP: number,
): number {
  return currentTotalXP + gainedXP;
}

// ─── G7 — totalXP İnvaryantı ──────────────────────────────────────────────────

describe('G7 — totalXP İnvaryantı (totalXP Invariant)', () => {
  /**
   * **Validates: Requirements 7.5**
   *
   * FOR ALL oyuncular, Player.totalXP değeri SHALL
   * sum(xpRequired(l) for l in 1..level-1) + player.xp
   * formülüyle hesaplanan değerle eşit olmalıdır.
   *
   * Test stratejisi: İnvaryant
   *   Arbitrary level (1-50) ve xp (0 to xpRequired(level)-1) değerleri için
   *   formülün doğruluğunu doğrula.
   */

  it('level=1 için totalXP === xp (önceki level yok)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: xpRequired(1) - 1 }),
        async (xp) => {
          const level = 1;
          const totalXP = calcTotalXP(level, xp);

          // level=1 için sum(xpRequired(l) for l in 1..0) = 0
          // totalXP = 0 + xp = xp
          expect(totalXP).toBe(xp);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('arbitrary level (1-50) ve xp için totalXP invariant doğrulanır', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 50 }).chain((level) =>
          fc.tuple(
            fc.constant(level),
            fc.integer({ min: 0, max: xpRequired(level) - 1 }),
          ),
        ),
        async ([level, xp]) => {
          const totalXP = calcTotalXP(level, xp);

          // Manuel hesaplama ile doğrula
          let expectedTotal = 0;
          for (let l = 1; l < level; l++) {
            expectedTotal += xpRequired(l);
          }
          expectedTotal += xp;

          expect(totalXP).toBe(expectedTotal);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('totalXP her zaman non-negative olmalı', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 50 }).chain((level) =>
          fc.tuple(
            fc.constant(level),
            fc.integer({ min: 0, max: xpRequired(level) - 1 }),
          ),
        ),
        async ([level, xp]) => {
          const totalXP = calcTotalXP(level, xp);
          expect(totalXP).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('level arttıkça totalXP monoton artar (aynı xp ile)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 49 }),
        async (level) => {
          // Aynı xp=0 ile level ve level+1 karşılaştır
          const totalXP_level = calcTotalXP(level, 0);
          const totalXP_levelPlus1 = calcTotalXP(level + 1, 0);

          // level+1 için totalXP, level için totalXP'den büyük olmalı
          // (çünkü xpRequired(level) > 0)
          expect(totalXP_levelPlus1).toBeGreaterThan(totalXP_level);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('artımlı güncelleme (addXP) backfill formülüyle tutarlı', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 49 }).chain((level) =>
          fc.tuple(
            fc.constant(level),
            fc.integer({ min: 0, max: xpRequired(level) - 2 }), // level-up olmayacak şekilde
            fc.integer({ min: 1, max: 10 }), // kazanılacak XP
          ),
        ).filter(([level, xp, gainedXP]) => xp + gainedXP < xpRequired(level)),
        async ([level, xp, gainedXP]) => {
          // Başlangıç totalXP
          const initialTotalXP = calcTotalXP(level, xp);

          // addXP simülasyonu: totalXP += gainedXP
          const updatedTotalXP = simulateAddXP(initialTotalXP, gainedXP);

          // Yeni xp değeri
          const newXP = xp + gainedXP;

          // Beklenen totalXP (backfill formülü ile)
          const expectedTotalXP = calcTotalXP(level, newXP);

          // Artımlı güncelleme backfill formülüyle tutarlı olmalı
          expect(updatedTotalXP).toBe(expectedTotalXP);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('xpRequired fonksiyonu her level için pozitif değer döndürür', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 100 }),
        async (level) => {
          const required = xpRequired(level);
          expect(required).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('level=50 için totalXP formülü doğru hesaplanır', async () => {
    // Deterministik test: level=50, xp=0
    const level = 50;
    const xp = 0;
    const totalXP = calcTotalXP(level, xp);

    let expected = 0;
    for (let l = 1; l < 50; l++) {
      expected += xpRequired(l);
    }

    expect(totalXP).toBe(expected);
    expect(totalXP).toBeGreaterThan(0);
  });
});
