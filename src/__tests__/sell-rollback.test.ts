import { describe, expect, it } from 'vitest';
import { resolveRollbackWindow } from '../systems/sell-rollback';

describe('resolveRollbackWindow', () => {
  const until = new Date('2026-06-11T15:30:00.000Z');

  it('1h — son 60 dakika', () => {
    const w = resolveRollbackWindow({ period: '1h', until });
    expect(w.end.toISOString()).toBe(until.toISOString());
    expect(w.start.toISOString()).toBe('2026-06-11T14:30:00.000Z');
    expect(w.period).toBe('1h');
  });

  it('1d — UTC gün', () => {
    const w = resolveRollbackWindow({ period: '1d', date: '2026-06-11', until });
    expect(w.start.toISOString()).toBe('2026-06-11T00:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-06-11T23:59:59.999Z');
    expect(w.label).toContain('2026-06-11');
  });

  it('1w — UTC hafta (Pazartesi başlangıç)', () => {
    const w = resolveRollbackWindow({ period: '1w', date: '2026-06-11', until });
    expect(w.start.toISOString()).toBe('2026-06-08T00:00:00.000Z');
    expect(w.end.toISOString()).toBe('2026-06-14T23:59:59.999Z');
  });

  it('1d — tarih yoksa until günü', () => {
    const w = resolveRollbackWindow({ period: '1d', until });
    expect(w.start.toISOString()).toBe('2026-06-11T00:00:00.000Z');
  });
});
