// ============================================================
// pvp-streak.ts — PvP Win Streak Sistemi
// Streak takibi, XP/coin bonusu, anti-abuse, milestone
// ============================================================

import type { PrismaClient } from '@prisma/client';
import {
  PVP_STREAK_COIN_BONUSES,
  PVP_STREAK_MAX_XP_BONUS,
  PVP_STREAK_MILESTONES,
  PVP_STREAK_MIN_OPPONENT_RATIO,
  PVP_STREAK_XP_BONUSES,
  XP_PVP_WIN,
} from '../config';
import { statEffect } from '../utils/math';

// ── Tipler ───────────────────────────────────────────────────────────────────

export interface StreakUpdateResult {
  /** Güncellenen streak değeri */
  newStreak: number;
  /** Önceki streak değeri */
  oldStreak: number;
  /** Tüm zamanların en yüksek streak'i */
  bestStreak: number;
  /** Yeni rekor mu? */
  isNewRecord: boolean;
  /** Streak sayıldı mı? (anti-abuse: false ise sayılmadı) */
  streakCounted: boolean;
  /** Uygulanan XP bonus yüzdesi (0 = bonus yok) */
  xpBonusPct: number;
  /** Uygulanan ekstra coin (0 = bonus yok) */
  bonusCoins: number;
  /** Milestone mesajı (varsa) */
  milestoneMsg: string | null;
  /** Kaybeden için: bozulan streak değeri */
  brokenStreak?: number;
}

interface OwlPower {
  statGaga:  number;
  statPence: number;
  statKanat: number;
}

// ── Yardımcılar ──────────────────────────────────────────────────────────────

/**
 * Baykuşun savaş gücünü hesaplar (pvp.ts ile aynı formül).
 */
function calcPower(owl: OwlPower): number {
  return statEffect(owl.statGaga + owl.statPence + owl.statKanat);
}

/**
 * Streak eşiğine göre XP bonus yüzdesini döndürür.
 */
export function getStreakXpBonus(streak: number): number {
  let bonus = 0;
  for (const entry of PVP_STREAK_XP_BONUSES) {
    if (streak >= entry.threshold) bonus = entry.bonus;
  }
  return Math.min(bonus, PVP_STREAK_MAX_XP_BONUS);
}

/**
 * Streak eşiğine göre ekstra coin miktarını döndürür.
 */
export function getStreakCoinBonus(streak: number): number {
  let coins = 0;
  for (const entry of PVP_STREAK_COIN_BONUSES) {
    if (streak >= entry.threshold) coins = entry.coins;
  }
  return coins;
}

/**
 * Milestone mesajını döndürür (tam eşleşme, geçiş anında gösterilir).
 */
export function getMilestoneMsg(newStreak: number, oldStreak: number): string | null {
  // Sadece bu savaşta milestone'a ulaşıldıysa göster
  for (const [threshold, msg] of Object.entries(PVP_STREAK_MILESTONES)) {
    const t = parseInt(threshold);
    if (newStreak >= t && oldStreak < t) return msg;
  }
  return null;
}

// ── Ana Fonksiyon ─────────────────────────────────────────────────────────────

/**
 * PvP sonrası streak'leri günceller, bonusları hesaplar ve DB'ye yazar.
 *
 * Anti-abuse: Rakibin gücü oyuncunun gücünün %70'inden düşükse streak sayılmaz.
 * Bu durumda galip yine kazanır ama streak artmaz.
 *
 * @returns Kazanan için StreakUpdateResult
 */
export async function updatePvpStreak(
  prisma: PrismaClient,
  winnerId: string,
  loserId: string,
): Promise<StreakUpdateResult> {
  // Kazanan ve kaybeden + baykuşlarını paralel çek
  const [winner, loser, winnerOwl, loserOwl] = await Promise.all([
    prisma.player.findUnique({
      where: { id: winnerId },
      select: { pvpStreak: true, pvpBestStreak: true },
    }),
    prisma.player.findUnique({
      where: { id: loserId },
      select: { pvpStreak: true },
    }),
    prisma.owl.findFirst({
      where: { ownerId: winnerId, isMain: true },
      select: { statGaga: true, statPence: true, statKanat: true },
    }),
    prisma.owl.findFirst({
      where: { ownerId: loserId, isMain: true },
      select: { statGaga: true, statPence: true, statKanat: true },
    }),
  ]);

  if (!winner || !loser) {
    return {
      newStreak: 0, oldStreak: 0, bestStreak: 0,
      isNewRecord: false, streakCounted: false,
      xpBonusPct: 0, bonusCoins: 0, milestoneMsg: null,
    };
  }

  // ── Anti-abuse kontrolü ───────────────────────────────────────────────────
  let streakCounted = true;
  if (winnerOwl && loserOwl) {
    const winnerPower = calcPower(winnerOwl);
    const loserPower  = calcPower(loserOwl);
    if (loserPower < winnerPower * PVP_STREAK_MIN_OPPONENT_RATIO) {
      streakCounted = false;
    }
  }

  const oldStreak  = winner.pvpStreak;
  const oldBest    = winner.pvpBestStreak;
  const brokenStreak = loser.pvpStreak;

  // ── Streak hesapla ────────────────────────────────────────────────────────
  // pvp.ts zaten pvpStreak'i artırıyor — biz sadece bestStreak ve bonusları yönetiyoruz
  // Ama anti-abuse durumunda pvpStreak'i geri al
  const newStreak  = streakCounted ? oldStreak + 1 : oldStreak;
  const newBest    = Math.max(oldBest, newStreak);
  const isNewRecord = newBest > oldBest;

  // ── Bonus hesapla ─────────────────────────────────────────────────────────
  const xpBonusPct  = streakCounted ? getStreakXpBonus(newStreak) : 0;
  const bonusCoins  = streakCounted ? getStreakCoinBonus(newStreak) : 0;
  const milestoneMsg = streakCounted ? getMilestoneMsg(newStreak, oldStreak) : null;

  // ── DB güncelle ───────────────────────────────────────────────────────────
  await Promise.all([
    // Kazanan: bestStreak güncelle, anti-abuse ise streak'i düzelt
    prisma.player.update({
      where: { id: winnerId },
      data: {
        pvpStreak:     streakCounted ? { increment: 1 } : oldStreak, // pvp.ts zaten +1 yaptı, anti-abuse ise geri al
        pvpBestStreak: newBest,
        // Bonus coin varsa ekle
        ...(bonusCoins > 0 ? { coins: { increment: bonusCoins } } : {}),
      },
    }),
    // Kaybeden: streak sıfırla (pvp.ts zaten yapıyor ama bestStreak için burada da kontrol)
    prisma.player.update({
      where: { id: loserId },
      data: { pvpStreak: 0 },
    }),
  ]);

  return {
    newStreak,
    oldStreak,
    bestStreak: newBest,
    isNewRecord,
    streakCounted,
    xpBonusPct,
    bonusCoins,
    milestoneMsg,
    brokenStreak,
  };
}

/**
 * Streak bonusunu XP miktarına uygular.
 * pvp.ts'teki addXP çağrısından önce kullanılır.
 */
export function applyStreakXpBonus(baseXP: number, bonusPct: number): number {
  if (bonusPct <= 0) return baseXP;
  return Math.round(baseXP * (1 + bonusPct / 100));
}
