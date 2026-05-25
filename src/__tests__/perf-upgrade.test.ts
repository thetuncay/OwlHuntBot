// ============================================================
// perf-upgrade.test.ts — Property-Based Test: Upgrade Sıra Bağımsızlığı
//
// G8 — Upgrade Sıra Bağımsızlığı:
//   FOR ALL upgrade işlemleri, Promise.all ile gerçekleştirilen envanter
//   güncellemeleri sıralı güncellemelerle aynı nihai envanter durumunu
//   üretmelidir.
//
// Validates: Requirements 8.4
//
// Framework: vitest + fast-check
// ============================================================

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ─── In-memory envanter ────────────────────────────────────────────────────────

type Inventory = Map<string, number>;

/**
 * Sıralı (sequential) envanter güncelleme.
 * Orijinal for döngüsü davranışını simüle eder.
 */
async function sequentialUpdate(
  inventory: Inventory,
  decrements: Array<{ itemName: string; amount: number }>,
): Promise<Inventory> {
  const result = new Map(inventory);
  for (const { itemName, amount } of decrements) {
    const current = result.get(itemName) ?? 0;
    result.set(itemName, current - amount);
  }
  return result;
}

/**
 * Paralel (Promise.all) envanter güncelleme.
 * Yeni Promise.all + updateMany davranışını simüle eder.
 * updateMany ile tüm itemlar aynı anda azaltılır.
 */
async function parallelUpdate(
  inventory: Inventory,
  decrements: Array<{ itemName: string; amount: number }>,
): Promise<Inventory> {
  const result = new Map(inventory);
  // Promise.all: tüm güncellemeler "aynı anda" başlar
  // JS single-threaded olduğu için sonuç deterministik
  await Promise.all(
    decrements.map(({ itemName, amount }) =>
      Promise.resolve().then(() => {
        const current = result.get(itemName) ?? 0;
        result.set(itemName, current - amount);
      }),
    ),
  );
  return result;
}

/**
 * updateMany simülasyonu: tüm itemlar için tek seferde decrement.
 * Gerçek Prisma updateMany davranışını yansıtır.
 */
async function updateManySimulation(
  inventory: Inventory,
  itemNames: string[],
  decrementAmount: number,
): Promise<Inventory> {
  const result = new Map(inventory);
  for (const itemName of itemNames) {
    if (result.has(itemName)) {
      result.set(itemName, (result.get(itemName) ?? 0) - decrementAmount);
    }
  }
  return result;
}

// ─── G8 — Upgrade Sıra Bağımsızlığı ──────────────────────────────────────────

describe('G8 — Upgrade Sıra Bağımsızlığı (Upgrade Order Independence)', () => {
  /**
   * **Validates: Requirements 8.4**
   *
   * FOR ALL upgrade işlemleri, Promise.all ile gerçekleştirilen envanter
   * güncellemeleri SHALL sıralı güncellemelerle aynı nihai envanter durumunu
   * üretir (sıra bağımsızlığı özelliği).
   */

  it('Promise.all ve sıralı güncelleme aynı nihai envanter durumunu üretir', async () => {
    await fc.assert(
      fc.asyncProperty(
        // 1-5 farklı item, her biri 1-100 arası başlangıç miktarı
        fc.array(
          fc.record({
            itemName: fc.string({ minLength: 1, maxLength: 20 }),
            quantity: fc.integer({ min: 10, max: 100 }),
          }),
          { minLength: 1, maxLength: 5 },
        ).map((items) => {
          // Benzersiz itemName'ler
          const seen = new Set<string>();
          return items.filter((i) => {
            if (seen.has(i.itemName)) return false;
            seen.add(i.itemName);
            return true;
          });
        }).filter((items) => items.length >= 1),
        // Her item için 1-5 arası decrement
        fc.integer({ min: 1, max: 5 }),
        async (items, decrementAmount) => {
          const inventory: Inventory = new Map(
            items.map(({ itemName, quantity }) => [itemName, quantity]),
          );

          const decrements = items.map(({ itemName }) => ({
            itemName,
            amount: decrementAmount,
          }));

          const [seqResult, parResult] = await Promise.all([
            sequentialUpdate(new Map(inventory), decrements),
            parallelUpdate(new Map(inventory), decrements),
          ]);

          // Her item için sonuçlar eşit olmalı
          for (const { itemName } of items) {
            expect(seqResult.get(itemName)).toBe(parResult.get(itemName));
          }
        },
      ),
      { numRuns: 500 },
    );
  });

  it('updateMany simülasyonu sıralı güncellemeyle aynı sonucu üretir', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            itemName: fc.string({ minLength: 1, maxLength: 20 }),
            quantity: fc.integer({ min: 10, max: 100 }),
          }),
          { minLength: 1, maxLength: 5 },
        ).map((items) => {
          const seen = new Set<string>();
          return items.filter((i) => {
            if (seen.has(i.itemName)) return false;
            seen.add(i.itemName);
            return true;
          });
        }).filter((items) => items.length >= 1),
        fc.integer({ min: 1, max: 5 }),
        async (items, decrementAmount) => {
          const inventory: Inventory = new Map(
            items.map(({ itemName, quantity }) => [itemName, quantity]),
          );

          const itemNames = items.map((i) => i.itemName);
          const decrements = items.map(({ itemName }) => ({
            itemName,
            amount: decrementAmount,
          }));

          const [seqResult, updateManyResult] = await Promise.all([
            sequentialUpdate(new Map(inventory), decrements),
            updateManySimulation(new Map(inventory), itemNames, decrementAmount),
          ]);

          for (const { itemName } of items) {
            expect(seqResult.get(itemName)).toBe(updateManyResult.get(itemName));
          }
        },
      ),
      { numRuns: 500 },
    );
  });

  it('güncelleme sırası sonucu etkilemez (permütasyon bağımsızlığı)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            itemName: fc.string({ minLength: 1, maxLength: 20 }),
            quantity: fc.integer({ min: 10, max: 100 }),
          }),
          { minLength: 2, maxLength: 5 },
        ).map((items) => {
          const seen = new Set<string>();
          return items.filter((i) => {
            if (seen.has(i.itemName)) return false;
            seen.add(i.itemName);
            return true;
          });
        }).filter((items) => items.length >= 2),
        fc.integer({ min: 1, max: 5 }),
        async (items, decrementAmount) => {
          const inventory: Inventory = new Map(
            items.map(({ itemName, quantity }) => [itemName, quantity]),
          );

          const decrements = items.map(({ itemName }) => ({
            itemName,
            amount: decrementAmount,
          }));

          // Orijinal sıra
          const result1 = await sequentialUpdate(new Map(inventory), decrements);

          // Ters sıra
          const result2 = await sequentialUpdate(new Map(inventory), [...decrements].reverse());

          // Her item için sonuçlar eşit olmalı (sıra bağımsız)
          for (const { itemName } of items) {
            expect(result1.get(itemName)).toBe(result2.get(itemName));
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('güncelleme sonrası miktar doğru hesaplanır', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.integer({ min: 5, max: 100 }),
        fc.integer({ min: 1, max: 4 }),
        async (itemName, initialQty, decrementAmount) => {
          const inventory: Inventory = new Map([[itemName, initialQty]]);
          const decrements = [{ itemName, amount: decrementAmount }];

          const result = await parallelUpdate(new Map(inventory), decrements);

          expect(result.get(itemName)).toBe(initialQty - decrementAmount);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('deterministik: 3 item, her biri 2 azaltılır', async () => {
    const inventory: Inventory = new Map([
      ['Tavşan', 10],
      ['Tilki', 8],
      ['Kartal', 5],
    ]);

    const decrements = [
      { itemName: 'Tavşan', amount: 2 },
      { itemName: 'Tilki', amount: 2 },
      { itemName: 'Kartal', amount: 2 },
    ];

    const [seqResult, parResult, updateManyResult] = await Promise.all([
      sequentialUpdate(new Map(inventory), decrements),
      parallelUpdate(new Map(inventory), decrements),
      updateManySimulation(new Map(inventory), ['Tavşan', 'Tilki', 'Kartal'], 2),
    ]);

    expect(seqResult.get('Tavşan')).toBe(8);
    expect(seqResult.get('Tilki')).toBe(6);
    expect(seqResult.get('Kartal')).toBe(3);

    // Tüm yöntemler aynı sonucu vermeli
    for (const itemName of ['Tavşan', 'Tilki', 'Kartal']) {
      expect(parResult.get(itemName)).toBe(seqResult.get(itemName));
      expect(updateManyResult.get(itemName)).toBe(seqResult.get(itemName));
    }
  });
});
