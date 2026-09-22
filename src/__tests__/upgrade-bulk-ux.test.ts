import { describe, it, expect } from 'vitest';
import { UPGRADE_BULK_MAX } from '../config';
import {
  clampUpgradeBulkSteps,
  planBulkUpgrade,
} from '../utils/upgrade-bulk';
import { buildUpgradePanel, buildUpgradeResult } from '../utils/upgrade-ux';
import { upgradeCoinCostAfterDiscount, upgradeMaterialRequirement } from '../utils/math';

describe('upgrade-bulk plan', () => {
  it('clamps all/requested into 1…UPGRADE_BULK_MAX', () => {
    expect(clampUpgradeBulkSteps(0)).toBe(1);
    expect(clampUpgradeBulkSteps(-3)).toBe(1);
    expect(clampUpgradeBulkSteps(999)).toBe(UPGRADE_BULK_MAX);
    expect(clampUpgradeBulkSteps(7.9)).toBe(7);
  });

  it('plans N affordable steps with rising total cost', () => {
    const trained = { gaga: 0, pence: 0, goz: 4, kulak: 0, kanat: 0 };
    const effective = { gaga: 10, pence: 10, goz: 15, kulak: 10, kanat: 10 };
    const stepsWanted = 3;
    let expectedCoin = 0;
    let expectedMat = 0;
    for (let t = 4; t < 4 + stepsWanted; t++) {
      expectedCoin += upgradeCoinCostAfterDiscount(t, 0);
      expectedMat += upgradeMaterialRequirement(t);
    }

    const plan = planBulkUpgrade({
      stat: 'goz',
      requestedSteps: stepsWanted,
      coins: expectedCoin + 10_000,
      materialQty: expectedMat + 100,
      discountFraction: 0,
      trainedStats: trained,
      effectiveStats: effective,
    });

    expect(plan.affordableSteps).toBe(3);
    expect(plan.totalCoin).toBe(expectedCoin);
    expect(plan.totalMaterial).toBe(expectedMat);
    expect(plan.startTrained).toBe(4);
    expect(plan.endTrained).toBe(7);
    expect(plan.startEffective).toBe(15);
    expect(plan.endEffective).toBe(18);
    expect(plan.stopReason).toBe('ok');
  });

  it('stops early when coins run out', () => {
    const trained = { gaga: 0, pence: 0, goz: 4, kulak: 0, kanat: 0 };
    const effective = { gaga: 10, pence: 10, goz: 15, kulak: 10, kanat: 10 };
    const firstCost = upgradeCoinCostAfterDiscount(4, 0);

    const plan = planBulkUpgrade({
      stat: 'goz',
      requestedSteps: 50,
      coins: firstCost,
      materialQty: 999,
      discountFraction: 0,
      trainedStats: trained,
      effectiveStats: effective,
    });

    expect(plan.affordableSteps).toBe(1);
    expect(plan.totalCoin).toBe(firstCost);
    expect(plan.stopReason).toBe('coins');
  });
});

describe('upgrade panel bulk UX', () => {
  it('shows multi-step range and total cost when bulkPlan > 1', () => {
    const embed = buildUpgradePanel({
      owlName: 'Tuncay',
      owlQuality: 'Common',
      stat: 'goz',
      statTrained: 4,
      statEffective: 15,
      coinCost: 180,
      coinDiscountPct: 0,
      materialCost: 3,
      materialName: 'Av Gözü Kristali',
      allStatsEffective: { gaga: 20, pence: 15, goz: 15, kulak: 20, kanat: 20 },
      bulkPlan: {
        requestedSteps: 50,
        affordableSteps: 12,
        totalCoin: 4200,
        totalMaterial: 48,
        startTrained: 4,
        endTrained: 16,
        startEffective: 15,
        endEffective: 27,
        stopReason: 'coins',
      },
      depCheck: { ok: true, dependsOn: null, required: 0, current: 0, gap: 0, suggestion: null },
    }, 'w');
    const desc = embed.data.description ?? '';
    expect(desc).toContain('15');
    expect(desc).toContain('27');
    expect(desc).toContain('4');
    expect(desc).toContain('16');
    expect(desc).toContain('4.200');
    expect(desc).toContain('×48');
    expect(desc).toContain('+12 eğitim');
    expect(desc).not.toContain('adım');
    expect(desc).not.toContain('istenilen');
    expect(desc).not.toContain('kaynak/kilit');
    expect(desc).not.toContain('Garanti **+1 eğitim**');
  });

  it('result embed shows only level range (no meta step line)', () => {
    const embed = buildUpgradeResult({
      stat: 'goz',
      oldTrained: 4,
      newTrained: 16,
      effectiveOld: 15,
      effectiveNew: 27,
      steps: 12,
    });
    const desc = embed.data.description ?? '';
    expect(desc).toContain('15');
    expect(desc).toContain('27');
    expect(desc).not.toContain('adım');
  });
});
