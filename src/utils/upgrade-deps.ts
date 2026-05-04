// ============================================================
// upgrade-deps.ts — Upgrade Bağımlılık Sistemi
// Mevcut formüllere dokunmaz. Sadece ön-kontrol katmanı.
// ============================================================

import type { OwlStatKey } from '../types';
import { UPGRADE_DEP_MIN_LEVEL, UPGRADE_DEPENDENCIES } from '../config';

// ── Tipler ───────────────────────────────────────────────────────────────────

export interface DepCheckResult {
  /** Bağımlılık karşılandı mı? */
  ok: boolean;
  /** Bağımlı olunan stat (null = bağımsız) */
  dependsOn: OwlStatKey | null;
  /** Gereken minimum seviye */
  required: number;
  /** Oyuncunun mevcut seviyesi */
  current: number;
  /** Eksik seviye sayısı */
  gap: number;
}

export interface AllStats {
  gaga:  number;
  goz:   number;
  kulak: number;
  kanat: number;
  pence: number;
}

// ── Çekirdek Kontrol ─────────────────────────────────────────────────────────

/**
 * Belirtilen statı hedef seviyeye çıkarmak için bağımlılık kontrolü yapar.
 *
 * @param stat       Yükseltilmek istenen stat
 * @param targetLevel Ulaşılmak istenen seviye (mevcut + 1)
 * @param stats      Baykuşun tüm mevcut stat seviyeleri
 */
export function checkUpgradeDep(
  stat: OwlStatKey,
  targetLevel: number,
  stats: AllStats,
): DepCheckResult {
  const dep = UPGRADE_DEPENDENCIES[stat];

  // Bağımsız stat veya düşük seviye eşiği altında → her zaman geçer
  if (!dep || dep.dependsOn === null || targetLevel < UPGRADE_DEP_MIN_LEVEL) {
    return { ok: true, dependsOn: null, required: 0, current: 0, gap: 0 };
  }

  const required = Math.floor(targetLevel * dep.ratio);
  const current  = stats[dep.dependsOn];
  const gap      = Math.max(0, required - current);

  return {
    ok:        gap === 0,
    dependsOn: dep.dependsOn,
    required,
    current,
    gap,
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
  // Bağımlılık zincirini takip et: engeli çözmek için ne gerekiyor?
  let current: OwlStatKey = blockedStat;
  const visited = new Set<OwlStatKey>();

  while (true) {
    if (visited.has(current)) break; // döngü koruması
    visited.add(current);

    const dep = UPGRADE_DEPENDENCIES[current];
    if (!dep || dep.dependsOn === null) break;

    const depStat = dep.dependsOn;
    const targetLevel = stats[current] + 1;
    const required = Math.floor(targetLevel * dep.ratio);

    if (stats[depStat] < required) {
      // Bu bağımlılık da karşılanmıyor, zinciri takip et
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
  targetLevel: number;   // mevcut + 1
  check:     DepCheckResult;
}

/**
 * Tüm statların bağımlılık durumunu tek seferde döndürür.
 * Upgrade paneli için kullanılır.
 */
export function getAllDepStatuses(stats: AllStats): StatDepStatus[] {
  const keys: OwlStatKey[] = ['gaga', 'pence', 'goz', 'kulak', 'kanat'];
  return keys.map((stat) => {
    const targetLevel = stats[stat] + 1;
    return {
      stat,
      targetLevel,
      check: checkUpgradeDep(stat, targetLevel, stats),
    };
  });
}
