/**
 * upgrade-bulk.ts — Toplu upgrade planı (salt hesap; DB yok).
 *
 * UI ve komut aynı planı kullanır: kaç adım gerçekten atılabilir,
 * toplam coin/materyal, başlangıç→bitiş eğitim/toplam.
 */

import { UPGRADE_BULK_MAX } from '../config';
import type { OwlStatKey } from '../types';
import {
  upgradeCoinCostAfterDiscount,
  upgradeMaterialRequirement,
} from './math';
import {
  resolveUpgradeGate,
  type AllStats,
} from './upgrade-deps';

export type BulkUpgradeStopReason =
  | 'ok'
  | 'none'
  | 'coins'
  | 'material'
  | 'gate';

export interface BulkUpgradePlan {
  /** İstenen adım (all → UPGRADE_BULK_MAX, veya sayı). */
  requestedSteps: number;
  /** Kaynak + kilit sonrası gerçekten atılacak adım. */
  affordableSteps: number;
  totalCoin: number;
  totalMaterial: number;
  startTrained: number;
  endTrained: number;
  startEffective: number;
  endEffective: number;
  stopReason: BulkUpgradeStopReason;
}

/**
 * İstenen adım sayısını clamp eder (1 … UPGRADE_BULK_MAX).
 * `all` komut tarafında UPGRADE_BULK_MAX olarak gelir.
 */
export function clampUpgradeBulkSteps(raw: number): number {
  if (!Number.isFinite(raw)) return 1;
  return Math.min(UPGRADE_BULK_MAX, Math.max(1, Math.floor(raw)));
}

/**
 * Mevcut coin/materyal ve fark/bağımlılık kilidi ile kaç eğitim adımı
 * art arda yapılabileceğini hesaplar. Her adımda maliyet eğitimin o anki
 * seviyesine göre artar (tek adım preview ile aynı formüller).
 *
 * @jsdocScore 9
 */
export function planBulkUpgrade(opts: {
  stat: OwlStatKey;
  requestedSteps: number;
  coins: number;
  materialQty: number;
  discountFraction: number;
  trainedStats: AllStats;
  effectiveStats: AllStats;
}): BulkUpgradePlan {
  const requestedSteps = clampUpgradeBulkSteps(opts.requestedSteps);
  const trained: AllStats = { ...opts.trainedStats };
  const effective: AllStats = { ...opts.effectiveStats };
  const startTrained = trained[opts.stat];
  const startEffective = effective[opts.stat];

  let coinsLeft = Math.max(0, Math.floor(opts.coins));
  let matLeft = Math.max(0, Math.floor(opts.materialQty));
  let totalCoin = 0;
  let totalMaterial = 0;
  let steps = 0;
  let stopReason: BulkUpgradeStopReason = 'ok';

  while (steps < requestedSteps) {
    const gate = resolveUpgradeGate(opts.stat, trained, effective);
    if (!gate.ok) {
      stopReason = steps === 0 ? 'gate' : 'gate';
      break;
    }

    const trainedNow = trained[opts.stat];
    const coinCost = upgradeCoinCostAfterDiscount(trainedNow, opts.discountFraction);
    const matCost = upgradeMaterialRequirement(trainedNow);

    if (coinsLeft < coinCost) {
      stopReason = 'coins';
      break;
    }
    if (matLeft < matCost) {
      stopReason = 'material';
      break;
    }

    coinsLeft -= coinCost;
    matLeft -= matCost;
    totalCoin += coinCost;
    totalMaterial += matCost;
    trained[opts.stat] = trainedNow + 1;
    effective[opts.stat] = effective[opts.stat] + 1;
    steps++;
  }

  if (steps === 0 && stopReason === 'ok') {
    stopReason = 'none';
  }
  if (steps === requestedSteps) {
    stopReason = 'ok';
  }

  return {
    requestedSteps,
    affordableSteps: steps,
    totalCoin,
    totalMaterial,
    startTrained,
    endTrained: trained[opts.stat],
    startEffective,
    endEffective: effective[opts.stat],
    stopReason,
  };
}
