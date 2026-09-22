import { describe, it, expect } from 'vitest';
import {
  applyTrainedDelta,
  buildOwlStatWriteData,
  getAvgEffectiveStat,
  getEffectiveStats,
  getTrainedStats,
  setBaseStats,
  syncLegacyStatColumns,
} from '../utils/owl-stats';

describe('owl-stats', () => {
  it('effective = base + trained with legacy sync', () => {
    const owl: Record<string, number> = {};
    setBaseStats(owl, { gaga: 20, goz: 18, kulak: 16, kanat: 14, pence: 12 }, {
      gaga: 8, goz: 0, kulak: 0, kanat: 0, pence: 0,
    });

    expect(getEffectiveStats(owl)).toEqual({
      gaga: 28, goz: 18, kulak: 16, kanat: 14, pence: 12,
    });
    expect(owl.statGaga).toBe(28);
    expect(getAvgEffectiveStat(owl)).toBe((28 + 18 + 16 + 14 + 12) / 5);
  });

  it('legacy-only owl treats all stats as base', () => {
    const owl = { statGaga: 50, statGoz: 40, statKulak: 30, statKanat: 20, statPence: 10 };
    expect(getEffectiveStats(owl).gaga).toBe(50);
    expect(getTrainedStats(owl).gaga).toBe(0);
  });

  it('applyTrainedDelta only changes trained layer', () => {
    const owl: Record<string, number> = {};
    setBaseStats(owl, { gaga: 15, goz: 15, kulak: 15, kanat: 15, pence: 15 });
    applyTrainedDelta(owl, 'gaga', 3);
    expect(owl.statGagaBase).toBe(15);
    expect(owl.statGagaTrained).toBe(3);
    expect(owl.statGaga).toBe(18);
  });

  it('buildOwlStatWriteData produces prisma-ready fields', () => {
    const data = buildOwlStatWriteData(
      { gaga: 10, goz: 11, kulak: 12, kanat: 13, pence: 14 },
    );
    expect(data.statGagaBase).toBe(10);
    expect(data.statGagaTrained).toBe(0);
    expect(data.statGaga).toBe(10);
  });

  it('syncLegacyStatColumns updates legacy columns', () => {
    const owl = {
      statGagaBase: 5,
      statGozBase: 5,
      statKulakBase: 5,
      statKanatBase: 5,
      statPenceBase: 5,
      statGagaTrained: 2,
      statGozTrained: 1,
      statKulakTrained: 0,
      statKanatTrained: 0,
      statPenceTrained: 0,
    };
    syncLegacyStatColumns(owl);
    expect(owl.statGaga).toBe(7);
    expect(owl.statGoz).toBe(6);
  });

  it('upgrade trained delta keeps base unchanged', () => {
    const owl: Record<string, number> = {};
    setBaseStats(owl, { gaga: 15, goz: 15, kulak: 15, kanat: 15, pence: 15 });
    applyTrainedDelta(owl, 'gaga', 1);
    expect(owl.statGagaBase).toBe(15);
    expect(owl.statGagaTrained).toBe(1);
    expect(owl.statGaga).toBe(16);
  });
});
