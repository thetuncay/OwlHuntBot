import { describe, expect, it } from 'vitest';
import { PREY } from '../config';
import { preyDiscoveryHint, preyLore } from '../config/prey-lore';
import {
  buildPreyDexHintLines,
  buildPreyDexProgressLine,
  computePreyDexProgress,
} from '../utils/prey-dex-ux';
import type { PreyDexRow } from '../systems/prey-dex';

function rows(discovered: string[]): PreyDexRow[] {
  return PREY.map((p) => ({
    preyName: p.name,
    discovered: discovered.includes(p.name),
    totalCaught: discovered.includes(p.name) ? 1 : 0,
    inventoryQty: 0,
  }));
}

describe('prey-lore', () => {
  it('has lore for every prey name', () => {
    for (const p of PREY) {
      expect(preyLore(p.name), p.name).toBeTruthy();
    }
  });

  it('gives solvable hints by difficulty', () => {
    expect(preyDiscoveryHint(1)).toContain('av');
    expect(preyDiscoveryHint(9)).toContain('derin');
  });
});

describe('prey-dex-ux', () => {
  it('computes progress and missing order', () => {
    const progress = computePreyDexProgress(rows(['fare']));
    expect(progress.discovered).toBe(1);
    expect(progress.total).toBe(PREY.length);
    expect(progress.missing[0]?.preyName).not.toBe('fare');
  });

  it('progress line includes Keşfedilen', () => {
    const line = buildPreyDexProgressLine(computePreyDexProgress(rows(['fare'])));
    expect(line).toContain('Keşfedilen 1/');
  });

  it('hint lines show ???? and a cap', () => {
    const hints = buildPreyDexHintLines(computePreyDexProgress(rows([])));
    expect(hints[0]).toContain('????');
    expect(hints.length).toBeLessThanOrEqual(5);
  });

  it('complete dex celebrates', () => {
    const all = PREY.map((p) => p.name);
    const hints = buildPreyDexHintLines(computePreyDexProgress(rows(all)));
    expect(hints[0]).toContain('tamam');
  });
});
