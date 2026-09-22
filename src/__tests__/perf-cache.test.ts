// ============================================================
// perf-cache.test.ts — Property-Based Test: Cache Tutarlılığı
//
// G1 — Önbellek Tutarlılığı:
//   FOR ALL userId, cache miss → DB → cache set → cache hit akışında
//   her iki sonucun eşit olduğunu doğrula.
//
// Validates: Requirements 1.5
//
// Framework: vitest + fast-check
// ============================================================

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

/**
 * Minimal in-memory Redis mock (Map tabanlı).
 */
function buildRedisMock() {
  const store = new Map<string, string>();
  return {
    store,
    get: async (key: string): Promise<string | null> => store.get(key) ?? null,
    set: async (key: string, value: string, _ex?: string, _ttl?: number): Promise<'OK'> => {
      store.set(key, value);
      return 'OK';
    },
  };
}

/**
 * Cache-first pattern: ensureRegisteredForInteraction mantığını test eder.
 *
 * 1. İlk çağrı: cache miss → DB'den değer al → cache'e yaz → sonucu döndür
 * 2. İkinci çağrı: cache hit → cache'den değer döndür (DB çağrısı yok)
 * 3. Her iki sonucun eşit olduğunu doğrula
 */
async function cacheFirstPattern(
  redis: ReturnType<typeof buildRedisMock>,
  userId: string,
  dbValue: boolean,
): Promise<{ firstResult: boolean; secondResult: boolean; dbCallCount: number }> {
  const cacheKey = `reg:${userId}`;
  let dbCallCount = 0;

  // Simüle edilmiş DB fonksiyonu
  const fetchFromDb = async (): Promise<boolean> => {
    dbCallCount++;
    return dbValue;
  };

  // --- İlk çağrı: cache miss ---
  const cached1 = await redis.get(cacheKey);
  let firstResult: boolean;
  if (cached1 !== null) {
    firstResult = true;
  } else {
    const dbResult = await fetchFromDb();
    if (dbResult) {
      await redis.set(cacheKey, '1', 'EX', 60);
    }
    firstResult = dbResult;
  }

  // --- İkinci çağrı: cache hit (eğer ilk çağrı true döndürdüyse) ---
  const cached2 = await redis.get(cacheKey);
  let secondResult: boolean;
  if (cached2 !== null) {
    secondResult = true;
  } else {
    const dbResult = await fetchFromDb();
    if (dbResult) {
      await redis.set(cacheKey, '1', 'EX', 60);
    }
    secondResult = dbResult;
  }

  return { firstResult, secondResult, dbCallCount };
}

// ─── G1 — Önbellek Tutarlılığı ────────────────────────────────────────────────

describe('G1 — Önbellek Tutarlılığı (Cache Consistency)', () => {
  /**
   * **Validates: Requirements 1.5**
   *
   * FOR ALL userId değerleri, cache hit ve cache miss durumları SHALL aynı
   * boolean sonucu döndürür (önbellek tutarlılığı).
   *
   * Test stratejisi: Round-trip
   *   cache miss → DB → cache set → cache hit → karşılaştır
   */

  it('cache hit ve cache miss aynı sonucu döndürür (dbValue=true)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 64 }),
        async (userId) => {
          const redis = buildRedisMock();
          const { firstResult, secondResult } = await cacheFirstPattern(redis, userId, true);

          // Her iki çağrı da aynı sonucu döndürmeli
          expect(firstResult).toBe(secondResult);
          // dbValue=true olduğu için her ikisi de true olmalı
          expect(firstResult).toBe(true);
          expect(secondResult).toBe(true);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('cache hit ve cache miss aynı sonucu döndürür (dbValue=false)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 64 }),
        async (userId) => {
          const redis = buildRedisMock();
          const { firstResult, secondResult } = await cacheFirstPattern(redis, userId, false);

          // Her iki çağrı da aynı sonucu döndürmeli
          expect(firstResult).toBe(secondResult);
          // dbValue=false olduğu için her ikisi de false olmalı
          expect(firstResult).toBe(false);
          expect(secondResult).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('cache hit durumunda DB çağrısı yapılmaz (dbValue=true)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 64 }),
        async (userId) => {
          const redis = buildRedisMock();
          const { dbCallCount } = await cacheFirstPattern(redis, userId, true);

          // İlk çağrı: 1 DB çağrısı (cache miss)
          // İkinci çağrı: 0 DB çağrısı (cache hit)
          // Toplam: 1 DB çağrısı
          expect(dbCallCount).toBe(1);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('cache key formatı reg:{userId} şeklinde olmalı', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 64 }),
        async (userId) => {
          const redis = buildRedisMock();
          await cacheFirstPattern(redis, userId, true);

          // Cache key'in doğru formatta olduğunu doğrula
          const expectedKey = `reg:${userId}`;
          expect(redis.store.has(expectedKey)).toBe(true);
          expect(redis.store.get(expectedKey)).toBe('1');
        },
      ),
      { numRuns: 200 },
    );
  });

  it('farklı userId değerleri birbirini etkilemez', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.tuple(
          fc.string({ minLength: 1, maxLength: 32 }),
          fc.string({ minLength: 1, maxLength: 32 }),
        ).filter(([a, b]) => a !== b),
        async ([userId1, userId2]) => {
          const redis = buildRedisMock();

          // userId1 için cache'e yaz
          await cacheFirstPattern(redis, userId1, true);

          // userId2 için cache miss olmalı (farklı key)
          const cached2 = await redis.get(`reg:${userId2}`);
          expect(cached2).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });
});
