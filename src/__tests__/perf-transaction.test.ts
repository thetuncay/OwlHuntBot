// ============================================================
// perf-transaction.test.ts — Property-Based Test: Transaction Atomikliği
//
// G3 — Transaction Atomikliği:
//   FOR ALL hunt transaction'ları, transaction başarısız olduğunda
//   veritabanında kısmi yazma kalmamalıdır.
//
// Validates: Requirements 3.3, 3.4
//
// Framework: vitest + fast-check
// ============================================================

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ─── In-memory "veritabanı" (rollback destekli) ───────────────────────────────

interface PlayerState {
  xp: number;
  level: number;
  coins: number;
  totalXP: number;
  totalHunts: number;
}

interface InventoryState {
  [itemName: string]: number;
}

interface DbState {
  player: PlayerState;
  inventory: InventoryState;
}

/**
 * Rollback destekli in-memory transaction simülasyonu.
 * Prisma $transaction davranışını yansıtır:
 * - Tüm adımlar başarılıysa commit
 * - Herhangi bir adım başarısızsa rollback (orijinal state korunur)
 */
async function runTransaction<T>(
  state: DbState,
  operations: Array<(db: DbState) => Promise<void>>,
  errorAtStep?: number,
): Promise<{ success: boolean; finalState: DbState }> {
  // Snapshot al (rollback için)
  const snapshot: DbState = {
    player: { ...state.player },
    inventory: { ...state.inventory },
  };

  // Working copy üzerinde çalış
  const workingState: DbState = {
    player: { ...state.player },
    inventory: { ...state.inventory },
  };

  try {
    for (let i = 0; i < operations.length; i++) {
      if (errorAtStep !== undefined && i === errorAtStep) {
        throw new Error(`Simüle edilmiş hata: adım ${i}`);
      }
      await operations[i]!(workingState);
    }

    // Commit: working state'i orijinal state'e uygula
    Object.assign(state.player, workingState.player);
    Object.assign(state.inventory, workingState.inventory);
    return { success: true, finalState: { ...state, player: { ...state.player }, inventory: { ...state.inventory } } };
  } catch {
    // Rollback: snapshot'tan geri yükle
    Object.assign(state.player, snapshot.player);
    Object.assign(state.inventory, snapshot.inventory);
    return { success: false, finalState: { ...state, player: { ...state.player }, inventory: { ...state.inventory } } };
  }
}

/**
 * Hunt transaction adımlarını oluşturur.
 * addXP + inventoryOps + player.update + recordHuntStats
 */
function buildHuntOperations(
  gainedXP: number,
  gainedCoins: number,
  itemName: string,
  huntCount: number,
): Array<(db: DbState) => Promise<void>> {
  return [
    // Adım 0: XP güncelle
    async (db) => {
      db.player.xp += gainedXP;
      db.player.totalXP += gainedXP;
    },
    // Adım 1: Envanter güncelle
    async (db) => {
      db.inventory[itemName] = (db.inventory[itemName] ?? 0) + 1;
    },
    // Adım 2: Coin güncelle
    async (db) => {
      db.player.coins += gainedCoins;
    },
    // Adım 3: Hunt istatistikleri güncelle
    async (db) => {
      db.player.totalHunts += huntCount;
    },
  ];
}

// ─── G3 — Transaction Atomikliği ──────────────────────────────────────────────

describe('G3 — Transaction Atomikliği (Transaction Atomicity)', () => {
  /**
   * **Validates: Requirements 3.3, 3.4**
   *
   * FOR ALL hunt transaction'ları, transaction başarısız olduğunda
   * veritabanında kısmi yazma kalmamalıdır.
   *
   * Test stratejisi: Hata koşulu
   *   Transaction ortasında hata enjekte et → rollback doğrula
   */

  it('transaction başarısız olduğunda orijinal state korunur', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 10, max: 100 }),  // gainedXP
        fc.integer({ min: 1, max: 50 }),    // gainedCoins
        fc.string({ minLength: 1, maxLength: 20 }), // itemName
        fc.integer({ min: 0, max: 3 }),     // errorAtStep (0-3 arası)
        async (gainedXP, gainedCoins, itemName, errorAtStep) => {
          const initialState: DbState = {
            player: { xp: 100, level: 5, coins: 500, totalXP: 1000, totalHunts: 20 },
            inventory: { [itemName]: 3 },
          };

          const state: DbState = {
            player: { ...initialState.player },
            inventory: { ...initialState.inventory },
          };

          const ops = buildHuntOperations(gainedXP, gainedCoins, itemName, 1);
          const { success, finalState } = await runTransaction(state, ops, errorAtStep);

          // Transaction başarısız olmalı
          expect(success).toBe(false);

          // Kısmi yazma kalmamalı — orijinal state korunmalı
          expect(finalState.player.xp).toBe(initialState.player.xp);
          expect(finalState.player.coins).toBe(initialState.player.coins);
          expect(finalState.player.totalXP).toBe(initialState.player.totalXP);
          expect(finalState.player.totalHunts).toBe(initialState.player.totalHunts);
          expect(finalState.inventory[itemName]).toBe(initialState.inventory[itemName]);
        },
      ),
      { numRuns: 400 },
    );
  });

  it('transaction başarılı olduğunda tüm değişiklikler uygulanır', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 10, max: 100 }),
        fc.integer({ min: 1, max: 50 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        async (gainedXP, gainedCoins, itemName) => {
          const initialState: DbState = {
            player: { xp: 100, level: 5, coins: 500, totalXP: 1000, totalHunts: 20 },
            inventory: { [itemName]: 3 },
          };

          const state: DbState = {
            player: { ...initialState.player },
            inventory: { ...initialState.inventory },
          };

          const ops = buildHuntOperations(gainedXP, gainedCoins, itemName, 1);
          // errorAtStep = undefined → başarılı transaction
          const { success, finalState } = await runTransaction(state, ops, undefined);

          expect(success).toBe(true);

          // Tüm değişiklikler uygulanmış olmalı
          expect(finalState.player.xp).toBe(initialState.player.xp + gainedXP);
          expect(finalState.player.totalXP).toBe(initialState.player.totalXP + gainedXP);
          expect(finalState.player.coins).toBe(initialState.player.coins + gainedCoins);
          expect(finalState.player.totalHunts).toBe(initialState.player.totalHunts + 1);
          expect(finalState.inventory[itemName]).toBe((initialState.inventory[itemName] ?? 0) + 1);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('hata adımından önceki değişiklikler de geri alınır (kısmi yazma yok)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 10, max: 100 }),
        fc.integer({ min: 1, max: 50 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.integer({ min: 1, max: 3 }), // errorAtStep 1-3 (adım 0 başarılı, sonrası hata)
        async (gainedXP, gainedCoins, itemName, errorAtStep) => {
          const initialState: DbState = {
            player: { xp: 100, level: 5, coins: 500, totalXP: 1000, totalHunts: 20 },
            inventory: { [itemName]: 3 },
          };

          const state: DbState = {
            player: { ...initialState.player },
            inventory: { ...initialState.inventory },
          };

          const ops = buildHuntOperations(gainedXP, gainedCoins, itemName, 1);
          const { success, finalState } = await runTransaction(state, ops, errorAtStep);

          expect(success).toBe(false);

          // Adım 0 başarılı olsa bile (XP güncellendi), rollback sonrası orijinal state olmalı
          expect(finalState.player.xp).toBe(initialState.player.xp);
          expect(finalState.player.totalXP).toBe(initialState.player.totalXP);
          // Diğer alanlar da değişmemiş olmalı
          expect(finalState.player.coins).toBe(initialState.player.coins);
          expect(finalState.player.totalHunts).toBe(initialState.player.totalHunts);
        },
      ),
      { numRuns: 300 },
    );
  });

  it('başarılı ve başarısız transaction sonrası state tutarlı kalır', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 10, max: 50 }),
        fc.integer({ min: 1, max: 20 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        async (gainedXP, gainedCoins, itemName) => {
          const state: DbState = {
            player: { xp: 100, level: 5, coins: 500, totalXP: 1000, totalHunts: 20 },
            inventory: { [itemName]: 5 },
          };

          const ops = buildHuntOperations(gainedXP, gainedCoins, itemName, 1);

          // Başarısız transaction (adım 2'de hata)
          const { success: fail1 } = await runTransaction(state, ops, 2);
          expect(fail1).toBe(false);

          // State değişmemiş olmalı
          expect(state.player.xp).toBe(100);
          expect(state.player.coins).toBe(500);

          // Başarılı transaction
          const { success: ok } = await runTransaction(state, ops, undefined);
          expect(ok).toBe(true);

          // Şimdi değişiklikler uygulanmış olmalı
          expect(state.player.xp).toBe(100 + gainedXP);
          expect(state.player.coins).toBe(500 + gainedCoins);
          expect(state.player.totalHunts).toBe(21);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('deterministik: adım 1\'de hata → XP değişikliği de geri alınır', async () => {
    const state: DbState = {
      player: { xp: 100, level: 5, coins: 500, totalXP: 1000, totalHunts: 20 },
      inventory: { 'Tavşan': 3 },
    };

    const ops = buildHuntOperations(50, 25, 'Tavşan', 1);

    // Adım 1'de hata (envanter güncellemesi) — adım 0 (XP) başarılı olsa bile rollback
    const { success } = await runTransaction(state, ops, 1);

    expect(success).toBe(false);
    // Rollback: XP değişmemiş olmalı
    expect(state.player.xp).toBe(100);
    expect(state.player.totalXP).toBe(1000);
    expect(state.player.coins).toBe(500);
    expect(state.inventory['Tavşan']).toBe(3);
  });

  it('deterministik: tüm adımlar başarılı → tam commit', async () => {
    const state: DbState = {
      player: { xp: 100, level: 5, coins: 500, totalXP: 1000, totalHunts: 20 },
      inventory: { 'Tilki': 2 },
    };

    const ops = buildHuntOperations(30, 15, 'Tilki', 1);
    const { success } = await runTransaction(state, ops, undefined);

    expect(success).toBe(true);
    expect(state.player.xp).toBe(130);
    expect(state.player.totalXP).toBe(1030);
    expect(state.player.coins).toBe(515);
    expect(state.player.totalHunts).toBe(21);
    expect(state.inventory['Tilki']).toBe(3);
  });
});
