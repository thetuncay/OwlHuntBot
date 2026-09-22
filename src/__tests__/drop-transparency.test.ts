import { describe, expect, it } from 'vitest';
import {
  LOOTBOX_LEVEL_SOFTCAP_MAX,
  LOOTBOX_LEVEL_SOFTCAP_START,
  lootboxLevelDropMultiplier,
  lootboxLevelSoftcapPercent,
} from '../config/drop-transparency';
import { buildDropRatesEmbed } from '../utils/drop-rates-ux';
import { LOOTBOX_DEFS, LOOTBOX_HUNT_DROP_CHANCE } from '../config';

describe('lootboxLevelDropMultiplier', () => {
  it('softcap başlangıcına kadar oranı düşürmez', () => {
    expect(lootboxLevelDropMultiplier(1)).toBe(1);
    expect(lootboxLevelDropMultiplier(LOOTBOX_LEVEL_SOFTCAP_START)).toBe(1);
  });

  it('softcap sonrası kademeli düşer', () => {
    const justAfter = lootboxLevelDropMultiplier(LOOTBOX_LEVEL_SOFTCAP_START + 5);
    expect(justAfter).toBeLessThan(1);
    expect(justAfter).toBeGreaterThan(1 - LOOTBOX_LEVEL_SOFTCAP_MAX);
  });

  it('maksimum azalmanın altına inmez (hard cap değil)', () => {
    const floor = 1 - LOOTBOX_LEVEL_SOFTCAP_MAX;
    expect(lootboxLevelDropMultiplier(500)).toBeCloseTo(floor, 5);
    expect(lootboxLevelDropMultiplier(10_000)).toBeCloseTo(floor, 5);
  });

  it('monoton azalır', () => {
    let prev = lootboxLevelDropMultiplier(1);
    for (let lvl = 2; lvl <= 120; lvl++) {
      const cur = lootboxLevelDropMultiplier(lvl);
      expect(cur).toBeLessThanOrEqual(prev);
      prev = cur;
    }
  });
});

describe('lootboxLevelSoftcapPercent', () => {
  it('softcap öncesi sıfır', () => {
    expect(lootboxLevelSoftcapPercent(LOOTBOX_LEVEL_SOFTCAP_START)).toBe(0);
  });

  it('tavanda maksimum yüzdeyi verir', () => {
    expect(lootboxLevelSoftcapPercent(999)).toBe(LOOTBOX_LEVEL_SOFTCAP_MAX * 100);
  });
});

describe('buildDropRatesEmbed', () => {
  it('config ile aynı oranları ilan eder', () => {
    const json = buildDropRatesEmbed('w').toJSON();
    const huntField = json.fields?.find((f) => f.name.includes('Avdan'));
    expect(huntField?.value).toContain(`%${LOOTBOX_HUNT_DROP_CHANCE.Eşya}`);
    expect(huntField?.value).toContain(`%${LOOTBOX_HUNT_DROP_CHANCE.Silah}`);
  });

  it('her kutunun pity eşiğini gerçek değerle yazar', () => {
    const json = buildDropRatesEmbed('w').toJSON();
    const pityField = json.fields?.find((f) => f.name.includes('Pity'));
    for (const def of LOOTBOX_DEFS) {
      expect(pityField?.value).toContain(String(def.pityThreshold));
    }
  });

  it('seviye softcap ve günlük cap sınırlarını gizlemez', () => {
    const json = buildDropRatesEmbed('w').toJSON();
    const limits = json.fields?.find((f) => f.name.includes('sınırlar'));
    expect(limits?.value).toContain(String(LOOTBOX_LEVEL_SOFTCAP_START));
    expect(limits?.value).toContain('10');
  });

  it('verilen prefix i footer da kullanır', () => {
    const json = buildDropRatesEmbed('owl').toJSON();
    expect(json.footer?.text).toContain('owl');
  });
});
