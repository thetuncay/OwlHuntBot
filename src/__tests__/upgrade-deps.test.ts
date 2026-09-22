import { describe, it, expect } from 'vitest';
import {
  checkUpgradeSpread,
  getStatsUpgradeHints,
  minTrainedStat,
  resolveUpgradeGate,
  type AllStats,
} from '../utils/upgrade-deps';
import { UPGRADE_SPREAD_MAX } from '../config';

const balanced: AllStats = {
  gaga: 20,
  pence: 20,
  goz: 20,
  kulak: 20,
  kanat: 20,
};

describe('upgrade-deps spread lock', () => {
  it('allows upgrade when spread is within limit', () => {
    const check = checkUpgradeSpread(21, balanced);
    expect(check.ok).toBe(true);
  });

  it('blocks when weakest stat is too far behind', () => {
    const skewed: AllStats = {
      gaga: 40,
      pence: 40,
      goz: 40,
      kulak: 5,
      kanat: 5,
    };
    const check = checkUpgradeSpread(41, skewed);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('spread');
    expect(check.dependsOn).toBe('kulak');
    expect(check.required).toBe(41 - UPGRADE_SPREAD_MAX);
    expect(check.current).toBe(5);
    expect(check.gap).toBe(16);
  });

  it('minTrainedStat finds weakest trained stat', () => {
    expect(minTrainedStat({
      gaga: 12,
      pence: 30,
      goz: 18,
      kulak: 9,
      kanat: 22,
    })).toEqual({ stat: 'kulak', value: 9 });
  });

  it('resolveUpgradeGate prefers dependency before spread', () => {
    const effective: AllStats = {
      gaga: 10,
      pence: 4,
      goz: 10,
      kulak: 10,
      kanat: 10,
    };
    const trained: AllStats = {
      gaga: 0,
      pence: 0,
      goz: 0,
      kulak: 0,
      kanat: 0,
    };
    const gate = resolveUpgradeGate('gaga', trained, effective);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toBe('dependency');
  });

  it('resolveUpgradeGate returns spread when dependency passes', () => {
    const effective: AllStats = {
      gaga: 50,
      pence: 50,
      goz: 12,
      kulak: 12,
      kanat: 12,
    };
    const trained: AllStats = {
      gaga: 25,
      pence: 25,
      goz: 10,
      kulak: 10,
      kanat: 10,
    };
    const gate = resolveUpgradeGate('gaga', trained, effective);
    expect(gate.ok).toBe(false);
    expect(gate.reason).toBe('spread');
    expect(gate.suggestion).toBe('goz');
    expect(gate.current).toBe(12);
  });

  it('getStatsUpgradeHints marks locked stats and suggests weakest', () => {
    const trained: AllStats = {
      gaga: 25,
      pence: 25,
      goz: 25,
      kulak: 10,
      kanat: 10,
    };
    const effective: AllStats = {
      gaga: 50,
      pence: 50,
      goz: 50,
      kulak: 12,
      kanat: 12,
    };
    const hints = getStatsUpgradeHints(trained, effective);
    expect(hints.locked).toContain('gaga');
    expect(hints.suggest).toBe('kulak');
  });
});
