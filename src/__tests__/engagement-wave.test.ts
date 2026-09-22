import { describe, expect, it, vi } from 'vitest';
import { formatTradeLogLines, type TradeLogEntry } from '../systems/trade-log';
import { formatPriceSignal } from '../utils/price-signal';
import { buddyBoostLine } from '../systems/buddy-boost';
import { formatFamilyHint, familyActionBonus, resolveOwlFamily } from '../systems/tame-families';
import { formatCosmeticTitleLine } from '../systems/cosmetics';
import { formatKudosCooldown, getKudosPeople, sendKudos } from '../systems/kudos';

describe('F1 trade log + F2 price signal', () => {
  it('formats own-side history', () => {
    const entries: TradeLogEntry[] = [{
      at: Date.parse('2026-01-15T12:00:00.000Z'),
      otherId: 'b',
      otherName: 'Efe',
      gave: '100c',
      got: 'fare×2',
    }];
    const lines = formatTradeLogLines(entries);
    expect(lines[0]).toContain('Efe');
    expect(formatTradeLogLines([])[0]).toContain('Henüz');
  });

  it('shows a range without locking a price', () => {
    const signal = formatPriceSignal({ lastSalePrice: 80, averagePrice24h: 100, averagePrice7d: 120 });
    expect(signal).toContain('80');
    expect(signal).toContain('120');
    expect(formatPriceSignal({ lastSalePrice: 0, averagePrice24h: 0, averagePrice7d: 0 })).toBeNull();
  });
});

describe('B4 tame families', () => {
  it('gives different preferred actions per species family', () => {
    expect(resolveOwlFamily('Kar baykusu')).toBe('snow');
    expect(familyActionBonus('snow', 'silent')).toBeGreaterThan(0);
    expect(familyActionBonus('snow', 'advance')).toBe(0);
    expect(formatFamilyHint('Kar baykusu')).toContain('sessiz');
  });
});

describe('H3 buddy + D3 titles', () => {
  it('speaks only for the first two hunts', () => {
    expect(buddyBoostLine(1)).toContain('Rehber');
    expect(buddyBoostLine(2)).toContain('w up');
    expect(buddyBoostLine(3)).toBeNull();
  });

  it('shows the latest title', () => {
    expect(formatCosmeticTitleLine(['Seri Avcı', 'İz Sürücü'])).toContain('Seri Avcı');
    expect(formatCosmeticTitleLine([])).toBeNull();
  });
});

describe('G3 kudos', () => {
  function fakeRedis() {
    const strings = new Map<string, number>();
    const sets = new Map<string, Set<string>>();
    return {
      set: vi.fn(async (key: string, _value: string, _px: string, _ms: number, nx: string) => {
        if (nx === 'NX' && strings.has(key)) return null;
        strings.set(key, Date.now() + 20 * 60 * 1000);
        return 'OK';
      }),
      pttl: vi.fn(async (key: string) => {
        const until = strings.get(key);
        if (until == null) return -2;
        return Math.max(0, until - Date.now());
      }),
      sadd: vi.fn(async (key: string, member: string) => {
        const set = sets.get(key) ?? new Set<string>();
        const added = set.has(member) ? 0 : 1;
        set.add(member);
        sets.set(key, set);
        return added;
      }),
      scard: vi.fn(async (key: string) => sets.get(key)?.size ?? 0),
    } as any;
  }

  it('blocks self and 20-minute cooldown; counts unique people', async () => {
    const redis = fakeRedis();
    expect((await sendKudos(redis, 'a', 'a')).reason).toBe('self');
    const first = await sendKudos(redis, 'a', 'b');
    expect(first.ok).toBe(true);
    expect(first.people).toBe(1);
    const second = await sendKudos(redis, 'a', 'c');
    expect(second.ok).toBe(false);
    expect(second.reason).toBe('cooldown');
    const other = await sendKudos(redis, 'd', 'b');
    expect(other.ok).toBe(true);
    expect(other.people).toBe(2);
    expect(await getKudosPeople(redis, 'b')).toBe(2);
    expect(formatKudosCooldown(90_000)).toBe('1 dk');
  });
});
