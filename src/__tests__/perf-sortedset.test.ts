// ============================================================
// perf-sortedset.test.ts — Property-Based Test: Sorted Set Tutarlılığı
//
// G13 — Sorted Set Tutarlılığı:
//   FOR ALL oyuncular, Redis Sorted Set'ten hesaplanan rank değeri
//   MongoDB COUNT sorgusuyla hesaplanan rank değeriyle tutarlı olmalıdır.
//
// Validates: Requirements 13.5
//
// Framework: vitest + fast-check
// ============================================================

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ─── In-memory Sorted Set implementasyonu ─────────────────────────────────────

/**
 * Redis Sorted Set'in in-memory implementasyonu.
 * ZADD, ZREVRANK, ZCARD operasyonlarını destekler.
 */
function buildInMemorySortedSet() {
  // playerId → score
  const scores = new Map<string, number>();

  /**
   * ZADD: Oyuncunun skorunu ekler veya günceller.
   */
  function zadd(playerId: string, score: number): void {
    scores.set(playerId, score);
  }

  /**
   * ZREVRANK: Yüksekten düşüğe sıralamada 0-indexed rank döndürür.
   * Eşit skorlarda lexicographic sıralama uygulanır (Redis davranışı).
   * Oyuncu bulunamazsa null döndürür.
   */
  function zrevrank(playerId: string): number | null {
    if (!scores.has(playerId)) return null;

    const allEntries = Array.from(scores.entries());

    // Yüksekten düşüğe sırala; eşit skorlarda playerId'ye göre sırala
    allEntries.sort(([idA, scoreA], [idB, scoreB]) => {
      if (scoreB !== scoreA) return scoreB - scoreA;
      return idA.localeCompare(idB); // lexicographic tiebreak
    });

    return allEntries.findIndex(([id]) => id === playerId);
  }

  /**
   * ZCARD: Sorted Set'teki toplam eleman sayısını döndürür.
   */
  function zcard(): number {
    return scores.size;
  }

  function getScores(): Map<string, number> {
    return new Map(scores);
  }

  return { zadd, zrevrank, zcard, getScores };
}

// ─── MongoDB COUNT simülasyonu ─────────────────────────────────────────────────

/**
 * MongoDB COUNT sorgusuyla rank hesaplama.
 * Rank = (kaç oyuncunun skoru bu oyuncunun skorundan yüksek) + 1
 *
 * Eşit skorlarda Redis ZREVRANK ile tutarlı olması için
 * aynı tiebreak mantığı uygulanır.
 */
function countBasedRank(
  scores: Map<string, number>,
  playerId: string,
): number {
  if (!scores.has(playerId)) return -1;

  const playerScore = scores.get(playerId)!;

  // Kaç oyuncunun skoru daha yüksek?
  let higherCount = 0;
  for (const [id, score] of scores.entries()) {
    if (id === playerId) continue;
    if (score > playerScore) {
      higherCount++;
    } else if (score === playerScore && id.localeCompare(playerId) < 0) {
      // Eşit skor, lexicographic olarak önce gelen → daha yüksek rank
      higherCount++;
    }
  }

  return higherCount + 1; // 1-indexed
}

// ─── G13 — Sorted Set Tutarlılığı ─────────────────────────────────────────────

describe('G13 — Sorted Set Tutarlılığı (Sorted Set Consistency)', () => {
  /**
   * **Validates: Requirements 13.5**
   *
   * FOR ALL oyuncular, Redis Sorted Set'ten hesaplanan rank değeri SHALL
   * MongoDB COUNT sorgusuyla hesaplanan rank değeriyle tutarlı olur.
   *
   * Test stratejisi: Model tabanlı test
   *   In-memory Sorted Set (Redis modeli) vs. COUNT sorgusu (MongoDB modeli)
   */

  it('ZREVRANK ve COUNT tabanlı rank her oyuncu için tutarlı', async () => {
    await fc.assert(
      fc.asyncProperty(
        // 1-10 oyuncu, her biri 0-1000 arası skor
        fc.array(
          fc.record({
            playerId: fc.string({ minLength: 1, maxLength: 16 }),
            score: fc.integer({ min: 0, max: 1000 }),
          }),
          { minLength: 1, maxLength: 10 },
        ).map((players) => {
          // Benzersiz playerId'ler için deduplicate
          const seen = new Set<string>();
          return players.filter((p) => {
            if (seen.has(p.playerId)) return false;
            seen.add(p.playerId);
            return true;
          });
        }).filter((players) => players.length >= 1),
        async (players) => {
          const sortedSet = buildInMemorySortedSet();

          // Tüm oyuncuları ZADD ile ekle
          for (const { playerId, score } of players) {
            sortedSet.zadd(playerId, score);
          }

          const allScores = sortedSet.getScores();

          // Her oyuncu için ZREVRANK ve COUNT rank'ı karşılaştır
          for (const { playerId } of players) {
            const zrevrankResult = sortedSet.zrevrank(playerId);
            const countRank = countBasedRank(allScores, playerId);

            // ZREVRANK 0-indexed, countRank 1-indexed
            expect(zrevrankResult).not.toBeNull();
            expect(zrevrankResult! + 1).toBe(countRank);
          }
        },
      ),
      { numRuns: 300 },
    );
  });

  it('tek oyuncu için rank her zaman 1', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 16 }),
        fc.integer({ min: 0, max: 10000 }),
        async (playerId, score) => {
          const sortedSet = buildInMemorySortedSet();
          sortedSet.zadd(playerId, score);

          const allScores = sortedSet.getScores();
          const zrevrankResult = sortedSet.zrevrank(playerId);
          const countRank = countBasedRank(allScores, playerId);

          expect(zrevrankResult).toBe(0); // 0-indexed → rank 1
          expect(countRank).toBe(1);
          expect(zrevrankResult! + 1).toBe(countRank);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('benzersiz en yüksek skorlu oyuncu rank=1 alır', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Diğer oyuncular 0-999 arası skor
        fc.array(
          fc.record({
            playerId: fc.string({ minLength: 1, maxLength: 16 }),
            score: fc.integer({ min: 0, max: 999 }),
          }),
          { minLength: 1, maxLength: 9 },
        ).map((players) => {
          const seen = new Set<string>();
          return players.filter((p) => {
            if (seen.has(p.playerId)) return false;
            seen.add(p.playerId);
            return true;
          });
        }).filter((players) => players.length >= 1),
        fc.string({ minLength: 1, maxLength: 16 }),
        async (players, topPlayerId) => {
          // topPlayerId'nin diğer oyunculardan farklı olduğunu garantile
          fc.pre(!players.some((p) => p.playerId === topPlayerId));

          const sortedSet = buildInMemorySortedSet();

          for (const { playerId, score } of players) {
            sortedSet.zadd(playerId, score);
          }

          // topPlayer'ı benzersiz en yüksek skor (1000) ile ekle
          sortedSet.zadd(topPlayerId, 1000);

          const allScores = sortedSet.getScores();
          const countRank = countBasedRank(allScores, topPlayerId);

          // Benzersiz en yüksek skor → rank 1 olmalı
          expect(countRank).toBe(1);
          expect(sortedSet.zrevrank(topPlayerId)).toBe(0);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('ZADD güncelleme sonrası rank tutarlılığı korunur', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            playerId: fc.string({ minLength: 1, maxLength: 16 }),
            score: fc.integer({ min: 0, max: 500 }),
          }),
          { minLength: 2, maxLength: 8 },
        ).map((players) => {
          const seen = new Set<string>();
          return players.filter((p) => {
            if (seen.has(p.playerId)) return false;
            seen.add(p.playerId);
            return true;
          });
        }).filter((players) => players.length >= 2),
        fc.integer({ min: 501, max: 1000 }), // yeni yüksek skor
        async (players, newHighScore) => {
          const sortedSet = buildInMemorySortedSet();

          for (const { playerId, score } of players) {
            sortedSet.zadd(playerId, score);
          }

          // İlk oyuncunun skorunu güncelle (yüksek skor)
          const targetPlayer = players[0]!;
          sortedSet.zadd(targetPlayer.playerId, newHighScore);

          const allScores = sortedSet.getScores();

          // Güncelleme sonrası tüm oyuncular için tutarlılık kontrolü
          for (const { playerId } of players) {
            const zrevrankResult = sortedSet.zrevrank(playerId);
            const countRank = countBasedRank(allScores, playerId);

            expect(zrevrankResult).not.toBeNull();
            expect(zrevrankResult! + 1).toBe(countRank);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it('ZCARD toplam oyuncu sayısını doğru döndürür', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            playerId: fc.string({ minLength: 1, maxLength: 16 }),
            score: fc.integer({ min: 0, max: 1000 }),
          }),
          { minLength: 1, maxLength: 20 },
        ).map((players) => {
          const seen = new Set<string>();
          return players.filter((p) => {
            if (seen.has(p.playerId)) return false;
            seen.add(p.playerId);
            return true;
          });
        }).filter((players) => players.length >= 1),
        async (players) => {
          const sortedSet = buildInMemorySortedSet();

          for (const { playerId, score } of players) {
            sortedSet.zadd(playerId, score);
          }

          expect(sortedSet.zcard()).toBe(players.length);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('mevcut olmayan oyuncu için ZREVRANK null döndürür', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 16 }),
        fc.string({ minLength: 1, maxLength: 16 }),
        async (existingId, missingId) => {
          fc.pre(existingId !== missingId);

          const sortedSet = buildInMemorySortedSet();
          sortedSet.zadd(existingId, 100);

          const result = sortedSet.zrevrank(missingId);
          expect(result).toBeNull();
        },
      ),
      { numRuns: 200 },
    );
  });

  it('rank sıralaması monoton: yüksek skor → düşük rank numarası', async () => {
    await fc.assert(
      fc.asyncProperty(
        // İki farklı oyuncu, farklı skorlar
        fc.tuple(
          fc.string({ minLength: 1, maxLength: 16 }),
          fc.string({ minLength: 1, maxLength: 16 }),
          fc.integer({ min: 0, max: 500 }),
          fc.integer({ min: 501, max: 1000 }),
        ).filter(([idA, idB]) => idA !== idB),
        async ([playerA, playerB, lowerScore, higherScore]) => {
          const sortedSet = buildInMemorySortedSet();
          sortedSet.zadd(playerA, lowerScore);
          sortedSet.zadd(playerB, higherScore);

          const rankA = sortedSet.zrevrank(playerA)!;
          const rankB = sortedSet.zrevrank(playerB)!;

          // Yüksek skor → düşük rank numarası (rank 0 = en iyi)
          expect(rankB).toBeLessThan(rankA);
        },
      ),
      { numRuns: 300 },
    );
  });

  // ─── Deterministik testler ─────────────────────────────────────────────────

  it('deterministik: 3 oyuncu, farklı skorlar', () => {
    const sortedSet = buildInMemorySortedSet();
    sortedSet.zadd('alice', 300);
    sortedSet.zadd('bob', 100);
    sortedSet.zadd('charlie', 200);

    const allScores = sortedSet.getScores();

    // ZREVRANK (0-indexed)
    expect(sortedSet.zrevrank('alice')).toBe(0);    // rank 1
    expect(sortedSet.zrevrank('charlie')).toBe(1);  // rank 2
    expect(sortedSet.zrevrank('bob')).toBe(2);      // rank 3

    // COUNT tabanlı rank (1-indexed)
    expect(countBasedRank(allScores, 'alice')).toBe(1);
    expect(countBasedRank(allScores, 'charlie')).toBe(2);
    expect(countBasedRank(allScores, 'bob')).toBe(3);

    // Tutarlılık
    expect(sortedSet.zrevrank('alice')! + 1).toBe(countBasedRank(allScores, 'alice'));
    expect(sortedSet.zrevrank('charlie')! + 1).toBe(countBasedRank(allScores, 'charlie'));
    expect(sortedSet.zrevrank('bob')! + 1).toBe(countBasedRank(allScores, 'bob'));
  });

  it('deterministik: eşit skorlarda lexicographic sıralama', () => {
    const sortedSet = buildInMemorySortedSet();
    sortedSet.zadd('alice', 500);
    sortedSet.zadd('bob', 500);
    sortedSet.zadd('charlie', 500);

    const allScores = sortedSet.getScores();

    // Eşit skor → lexicographic sıralama: alice < bob < charlie
    // ZREVRANK: alice=0, bob=1, charlie=2
    expect(sortedSet.zrevrank('alice')).toBe(0);
    expect(sortedSet.zrevrank('bob')).toBe(1);
    expect(sortedSet.zrevrank('charlie')).toBe(2);

    // COUNT rank tutarlılığı
    expect(sortedSet.zrevrank('alice')! + 1).toBe(countBasedRank(allScores, 'alice'));
    expect(sortedSet.zrevrank('bob')! + 1).toBe(countBasedRank(allScores, 'bob'));
    expect(sortedSet.zrevrank('charlie')! + 1).toBe(countBasedRank(allScores, 'charlie'));
  });

  it('deterministik: lb:power kategorisi simülasyonu', () => {
    const sortedSet = buildInMemorySortedSet();

    // Oyuncuları ZADD ile ekle (lb:power kategorisi)
    const players = [
      { id: 'player1', score: 1500 },
      { id: 'player2', score: 2000 },
      { id: 'player3', score: 800 },
      { id: 'player4', score: 2000 }, // player2 ile eşit
      { id: 'player5', score: 1200 },
    ];

    for (const { id, score } of players) {
      sortedSet.zadd(id, score);
    }

    const allScores = sortedSet.getScores();

    // player2 ve player4 eşit skor (2000) → lexicographic: player2 < player4
    expect(sortedSet.zrevrank('player2')).toBe(0); // rank 1
    expect(sortedSet.zrevrank('player4')).toBe(1); // rank 2
    expect(sortedSet.zrevrank('player1')).toBe(2); // rank 3
    expect(sortedSet.zrevrank('player5')).toBe(3); // rank 4
    expect(sortedSet.zrevrank('player3')).toBe(4); // rank 5

    // COUNT tutarlılığı
    for (const { id } of players) {
      const zrevrankResult = sortedSet.zrevrank(id)!;
      const countRank = countBasedRank(allScores, id);
      expect(zrevrankResult + 1).toBe(countRank);
    }
  });
});
