import { describe, expect, it } from 'vitest';
import {
  DAILY_SOFT_CAP_CEILING_MULT,
  DAILY_SOFT_CAP_RATE,
  DUEL_DAILY_COIN_CAP,
} from '../config';
import { grantDuelDailyCoins } from '../utils/lock';

/**
 * Lua betiğini gerçek Redis olmadan doğrulamak için minimal `eval` taklidi.
 * Softening mantığının kendisi Lua içinde; buradaki simülasyon aynı adımları
 * TypeScript'te tekrarlar ve `grantDuelDailyCoins` sözleşmesini test eder.
 */
function createFakeRedis() {
  const store = new Map<string, number>();

  return {
    store,
    async eval(
      _script: string,
      _numKeys: number,
      key: string,
      addRaw: string,
      capRaw: string,
      _ttlRaw: string,
      rateRaw: string,
      ceilRaw: string,
    ): Promise<number> {
      const add = Number(addRaw);
      const cap = Number(capRaw);
      const rate = Number(rateRaw);
      const ceiling = Number(ceilRaw);
      let cur = store.get(key) ?? 0;

      if (add <= 0) return 0;
      if (cur >= ceiling) return 0;

      let grant = 0;
      let remaining = add;

      if (cur < cap) {
        const full = Math.min(cap - cur, remaining);
        grant += full;
        remaining -= full;
        cur += full;
      }
      if (remaining > 0 && cur < ceiling) {
        const soft = Math.min(Math.floor(remaining * rate), ceiling - cur);
        if (soft > 0) grant += soft;
      }
      if (grant <= 0) return 0;
      store.set(key, (store.get(key) ?? 0) + grant);
      return grant;
    },
  } as unknown as Parameters<typeof grantDuelDailyCoins>[0] & { store: Map<string, number> };
}

const CAP = DUEL_DAILY_COIN_CAP;
const CEILING = Math.floor(CAP * DAILY_SOFT_CAP_CEILING_MULT);
const TTL = 3600;

describe('grantDuelDailyCoins — I4 softening', () => {
  it('soft cap altında talebin tamamını verir', async () => {
    const redis = createFakeRedis();
    const granted = await grantDuelDailyCoins(redis, 'k', 130, CAP, TTL);
    expect(granted).toBe(130);
  });

  it('soft cap dolduktan sonra sıfırlanmaz — azaltılmış devam eder', async () => {
    const redis = createFakeRedis();
    await grantDuelDailyCoins(redis, 'k', CAP, CAP, TTL);
    const afterCap = await grantDuelDailyCoins(redis, 'k', 400, CAP, TTL);

    // Eski davranış 0 döndürüyordu; softening'in tüm amacı bu.
    expect(afterCap).toBeGreaterThan(0);
    expect(afterCap).toBe(Math.floor(400 * DAILY_SOFT_CAP_RATE));
  });

  it('soft cap sınırını aşan tek istek iki oranı da uygular', async () => {
    const redis = createFakeRedis();
    const belowCap = CAP - 100;
    await grantDuelDailyCoins(redis, 'k', belowCap, CAP, TTL);

    // 500'ün 100'ü tam oranla, kalan 400'ü azaltılmış oranla.
    const granted = await grantDuelDailyCoins(redis, 'k', 500, CAP, TTL);
    expect(granted).toBe(100 + Math.floor(400 * DAILY_SOFT_CAP_RATE));
  });

  it('mutlak tavana ulaşınca durur — sınırsız farming yok', async () => {
    const redis = createFakeRedis();
    for (let i = 0; i < 400; i++) {
      await grantDuelDailyCoins(redis, 'k', 1000, CAP, TTL);
    }
    expect(redis.store.get('k')).toBe(CEILING);
    expect(await grantDuelDailyCoins(redis, 'k', 1000, CAP, TTL)).toBe(0);
  });

  it('günlük toplam mutlak tavanı asla geçmez', async () => {
    const redis = createFakeRedis();
    let total = 0;
    for (let i = 0; i < 200; i++) {
      total += await grantDuelDailyCoins(redis, 'k', 130, CAP, TTL);
    }
    expect(total).toBeLessThanOrEqual(CEILING);
  });

  it('sıfır veya negatif talep bir şey vermez', async () => {
    const redis = createFakeRedis();
    expect(await grantDuelDailyCoins(redis, 'k', 0, CAP, TTL)).toBe(0);
    expect(await grantDuelDailyCoins(redis, 'k', -50, CAP, TTL)).toBe(0);
  });

  it('oyuncular arası sayaç sızmaz', async () => {
    const redis = createFakeRedis();
    await grantDuelDailyCoins(redis, 'p1', CAP, CAP, TTL);
    expect(await grantDuelDailyCoins(redis, 'p2', 130, CAP, TTL)).toBe(130);
  });
});

describe('softening kalibrasyonu', () => {
  it('oran hard-cap de işlevsiz cap de değil', () => {
    expect(DAILY_SOFT_CAP_RATE).toBeGreaterThan(0);
    expect(DAILY_SOFT_CAP_RATE).toBeLessThan(1);
  });

  it('tavan cap üstünde ama sınırsız değil', () => {
    expect(DAILY_SOFT_CAP_CEILING_MULT).toBeGreaterThan(1);
    expect(DAILY_SOFT_CAP_CEILING_MULT).toBeLessThanOrEqual(2);
  });

  it('soft bölgeyi doldurmak orantısız çaba gerektirir', () => {
    const softRoom = CEILING - CAP;
    const grossNeeded = softRoom / DAILY_SOFT_CAP_RATE;
    // Ek ödülü almak için cap'i doldurmaktan daha fazla brüt kazanç şart.
    expect(grossNeeded).toBeGreaterThan(CAP);
  });
});
