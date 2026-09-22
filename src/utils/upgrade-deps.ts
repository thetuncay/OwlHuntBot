// ============================================================
// upgrade-deps.ts — Upgrade Bağımlılık + Fark Kilidi
// Mevcut formüllere dokunmaz. Sadece ön-kontrol katmanı.
// ============================================================

import type { OwlStatKey } from '../types';
import { UPGRADE_DEP_MIN_LEVEL, UPGRADE_DEPENDENCIES, UPGRADE_SPREAD_MAX } from '../config';

// ── Tipler ───────────────────────────────────────────────────────────────────

export type UpgradeGateReason = 'dependency' | 'spread';

export interface DepCheckResult {
  /** Bağımlılık / fark kilidi karşılandı mı? */
  ok: boolean;
  /** Engelleme nedeni */
  reason?: UpgradeGateReason;
  /** Önce yükseltilmesi gereken stat (null = bağımsız / engel yok) */
  dependsOn: OwlStatKey | null;
  /** Gereken minimum seviye */
  required: number;
  /** Oyuncunun mevcut seviyesi */
  current: number;
  /** Eksik seviye sayısı */
  gap: number;
}

export interface UpgradeGateResult extends DepCheckResult {
  suggestion: OwlStatKey | null;
}

export interface AllStats {
  gaga:  number;
  goz:   number;
  kulak: number;
  kanat: number;
  pence: number;
}

const STAT_KEYS: OwlStatKey[] = ['gaga', 'pence', 'goz', 'kulak', 'kanat'];

// ── Çekirdek Kontrol ─────────────────────────────────────────────────────────

/**
 * Belirtilen statı hedef seviyeye çıkarmak için bağımlılık kontrolü yapar.
 *
 * @param stat       Yükseltilmek istenen stat
 * @param targetLevel Ulaşılmak istenen toplam (effective) seviye
 * @param stats      Baykuşun tüm mevcut toplam stat seviyeleri
 */
export function checkUpgradeDep(
  stat: OwlStatKey,
  targetLevel: number,
  stats: AllStats,
): DepCheckResult {
  const dep = UPGRADE_DEPENDENCIES[stat];

  if (!dep || dep.dependsOn === null || targetLevel < UPGRADE_DEP_MIN_LEVEL) {
    return { ok: true, dependsOn: null, required: 0, current: 0, gap: 0 };
  }

  const required = Math.floor(targetLevel * dep.ratio);
  const current  = stats[dep.dependsOn];
  const gap      = Math.max(0, required - current);

  return {
    ok:        gap === 0,
    reason:    gap === 0 ? undefined : 'dependency',
    dependsOn: dep.dependsOn,
    required,
    current,
    gap,
  };
}

/**
 * Eğitim katmanında fark kilidi — tek stata yığılmayı sınırlar.
 * nextTrainedLevel için min(tüm eğitimler) ≥ nextTrainedLevel - SPREAD_MAX
 */
export function checkUpgradeSpread(
  nextTrainedLevel: number,
  trainedStats: AllStats,
  spreadMax = UPGRADE_SPREAD_MAX,
): DepCheckResult {
  const required = Math.max(0, nextTrainedLevel - spreadMax);
  const weakest = minTrainedStat(trainedStats);
  const gap = Math.max(0, required - weakest.value);

  return {
    ok:        gap === 0,
    reason:    gap === 0 ? undefined : 'spread',
    dependsOn: weakest.stat,
    required,
    current:   weakest.value,
    gap,
  };
}

export function minTrainedStat(trainedStats: AllStats): { stat: OwlStatKey; value: number } {
  let minStat: OwlStatKey = STAT_KEYS[0]!;
  let minValue = trainedStats[minStat];
  for (const key of STAT_KEYS) {
    if (trainedStats[key] < minValue) {
      minStat = key;
      minValue = trainedStats[key];
    }
  }
  return { stat: minStat, value: minValue };
}

export function resolveUpgradeGate(
  stat: OwlStatKey,
  trainedStats: AllStats,
  effectiveStats: AllStats,
): UpgradeGateResult {
  const targetEffective = effectiveStats[stat] + 1;

  const dep = checkUpgradeDep(stat, targetEffective, effectiveStats);
  if (!dep.ok) {
    return {
      ...dep,
      reason: 'dependency',
      suggestion: suggestNextUpgrade(stat, effectiveStats),
    };
  }

  const spread = checkUpgradeSpread(targetEffective, effectiveStats);
  if (!spread.ok) {
    return {
      ...spread,
      reason: 'spread',
      suggestion: spread.dependsOn,
    };
  }

  return {
    ok: true,
    dependsOn: null,
    required: 0,
    current: 0,
    gap: 0,
    suggestion: null,
  };
}

// ── Öneri Sistemi ─────────────────────────────────────────────────────────────

/**
 * Oyuncunun şu an yükseltmesi için en mantıklı statı önerir.
 * Bağımlılık zincirinde en altta kalan (en temel) engeli bulur.
 */
export function suggestNextUpgrade(
  blockedStat: OwlStatKey,
  stats: AllStats,
): OwlStatKey {
  let current: OwlStatKey = blockedStat;
  const visited = new Set<OwlStatKey>();

  while (true) {
    if (visited.has(current)) break;
    visited.add(current);

    const dep = UPGRADE_DEPENDENCIES[current];
    if (!dep || dep.dependsOn === null) break;

    const depStat = dep.dependsOn;
    const targetLevel = stats[current] + 1;
    const required = Math.floor(targetLevel * dep.ratio);

    if (stats[depStat] < required) {
      current = depStat;
    } else {
      break;
    }
  }

  return current === blockedStat
    ? (UPGRADE_DEPENDENCIES[blockedStat]?.dependsOn ?? blockedStat)
    : current;
}

// ── Tüm Statlar İçin Durum Özeti ─────────────────────────────────────────────

export interface StatDepStatus {
  stat:      OwlStatKey;
  targetLevel: number;
  check:     DepCheckResult;
}

export function getStatsUpgradeHints(
  trainedStats: AllStats,
  effectiveStats: AllStats,
): { locked: OwlStatKey[]; suggest: OwlStatKey | null } {
  const locked: OwlStatKey[] = [];
  let hasBlocked = false;

  for (const stat of STAT_KEYS) {
    const gate = resolveUpgradeGate(stat, trainedStats, effectiveStats);
    if (!gate.ok) {
      locked.push(stat);
      hasBlocked = true;
    }
  }

  if (!hasBlocked) {
    return { locked, suggest: null };
  }

  let suggest = STAT_KEYS.reduce((minStat, stat) =>
    trainedStats[stat] < trainedStats[minStat] ? stat : minStat,
  );
  const suggestGate = resolveUpgradeGate(suggest, trainedStats, effectiveStats);
  if (!suggestGate.ok && suggestGate.suggestion) {
    suggest = suggestGate.suggestion;
  }

  return { locked, suggest };
}

export function getAllDepStatuses(
  trainedStats: AllStats,
  effectiveStats: AllStats,
): StatDepStatus[] {
  return STAT_KEYS.map((stat) => {
    const gate = resolveUpgradeGate(stat, trainedStats, effectiveStats);
    return {
      stat,
      targetLevel: effectiveStats[stat] + 1,
      check: gate,
    };
  });
}
