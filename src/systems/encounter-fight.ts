// ============================================================
// encounter-fight.ts — Encounter Savaş Sistemi
//
// Oyuncu "Savaş" seçeneğini seçtiğinde çalışır.
// Sonuç önceden hesaplanır (hızlı sistem — Discord timeout yok).
//
// Denge kuralları:
//   - Ödül düşman tier'ına ve güç farkına göre ölçeklenir
//   - Güçlü oyuncu zayıf düşmana karşı daha az ödül alır (hidden scaling)
//   - Kaybedince sadece encounter kapanır, ceza yok (uzaklaş ile aynı)
//   - Kazanınca coin + XP ödülü
// ============================================================

import type { PrismaClient } from '@prisma/client';
import { statEffect } from '../utils/math';
import { addXP } from './xp';
import type { EncounterFightResult } from '../utils/encounter-ux';

// ─── ÖDÜL TABLOSU ─────────────────────────────────────────────────────────────
// Tier'a gore base oduller (tier 1 = en guclu = en yuksek odul)
const FIGHT_BASE_COINS: Record<number, number> = {
  1: 180, 2: 140, 3: 110, 4: 85,
  5: 65,  6: 50,  7: 38,  8: 28,
};

const FIGHT_BASE_XP: Record<number, number> = {
  1: 90, 2: 70, 3: 55, 4: 42,
  5: 32, 6: 24, 7: 18, 8: 12,
};

// ─── KAZANMA ŞANSI HESABI ─────────────────────────────────────────────────────

/**
 * Oyuncunun savaşı kazanma şansını hesaplar.
 *
 * Temel formül:
 *   winChance = 50 + (playerPower - enemyPower) * 0.35
 *
 * Clamp: %20 - %85
 *   - Hiçbir zaman garantili kazanma veya kaybetme yok
 *   - Güçlü oyuncu zayıf düşmana karşı max %85 şansa sahip
 *   - Zayıf oyuncu güçlü düşmana karşı min %20 şansa sahip
 *
 * Hidden scaling:
 *   Oyuncunun toplam gücü çok yüksekse düşman gücü gizlice artırılır.
 *   Bu sayede farming önlenir.
 */
function calcWinChance(
  playerPower: number,
  enemyPower:  number,
  playerLevel: number,
): number {
  // Gizli ölçekleme: yüksek seviyeli oyuncular için düşman gücü artırılır
  // Level 20'den itibaren devreye girer, her level +0.5% düşman güç bonusu
  const hiddenScaling = Math.max(0, (playerLevel - 20) * 0.005);
  const scaledEnemyPower = enemyPower * (1 + hiddenScaling);

  const raw = 50 + (playerPower - scaledEnemyPower) * 0.35;
  return Math.min(85, Math.max(20, raw));
}

// ─── ÖDÜL HESABI ──────────────────────────────────────────────────────────────

/**
 * Kazanma ödülünü hesaplar.
 *
 * Güç farkı büyükse (oyuncu çok güçlü) ödül azalır — farming önleme.
 * Güç farkı küçükse veya düşman güçlüyse ödül artar — risk/ödül dengesi.
 */
function calcReward(
  baseCoin: number,
  baseXP:   number,
  playerPower: number,
  enemyPower:  number,
): { coins: number; xp: number } {
  const powerRatio = enemyPower / Math.max(1, playerPower);

  // powerRatio > 1 = düşman güçlü → ödül artar (max x1.5)
  // powerRatio < 0.5 = düşman çok zayıf → ödül azalır (min x0.5)
  const rewardMult = Math.min(1.5, Math.max(0.5, powerRatio));

  return {
    coins: Math.round(baseCoin * rewardMult),
    xp:    Math.round(baseXP   * rewardMult),
  };
}

// ─── ANA FONKSİYON ────────────────────────────────────────────────────────────

/**
 * Encounter savaşını simüle eder ve sonucu döndürür.
 *
 * @param prisma   - Prisma client
 * @param playerId - Oyuncu ID
 * @param encounterId - Encounter ID
 * @returns EncounterFightResult
 */
export async function resolveEncounterFight(
  prisma:      PrismaClient,
  playerId:    string,
  encounterId: string,
): Promise<EncounterFightResult> {
  // Encounter ve oyuncu verilerini paralel çek
  const [encounter, player, mainOwl] = await Promise.all([
    prisma.encounter.findFirst({
      where: { id: encounterId, playerId },
      select: {
        id: true, status: true,
        owlTier: true, owlStats: true,
      },
    }),
    prisma.player.findUnique({
      where: { id: playerId },
      select: { level: true },
    }),
    prisma.owl.findFirst({
      where: { ownerId: playerId, isMain: true },
      select: {
        statGaga: true, statGoz: true, statKulak: true,
        statKanat: true, statPence: true,
      },
    }),
  ]);

  if (!encounter || encounter.status !== 'open') {
    throw new Error('Encounter bulunamadı veya artık aktif değil.');
  }
  if (!player || !mainOwl) {
    throw new Error('Oyuncu veya main baykuş bulunamadı.');
  }

  // Stat'ları soft cap formülüyle hesapla
  const playerPower =
    statEffect(mainOwl.statGaga)  +
    statEffect(mainOwl.statGoz)   +
    statEffect(mainOwl.statKulak) +
    statEffect(mainOwl.statKanat) +
    statEffect(mainOwl.statPence);

  // Düşman stat'larını encounter'dan oku
  const rawStats = encounter.owlStats as Record<string, number>;
  const enemyPower =
    statEffect(rawStats.gaga  ?? 10) +
    statEffect(rawStats.goz   ?? 10) +
    statEffect(rawStats.kulak ?? 10) +
    statEffect(rawStats.kanat ?? 10) +
    statEffect(rawStats.pence ?? 10);

  const winChance = calcWinChance(playerPower, enemyPower, player.level);
  const playerWon = Math.random() * 100 < winChance;

  // Encounter'ı kapat
  await prisma.encounter.update({
    where: { id: encounterId },
    data: { status: 'closed' },
  });

  if (!playerWon) {
    return {
      playerWon:   false,
      rewardCoins: 0,
      rewardXP:    0,
      enemyTier:   encounter.owlTier,
      enemyLevel:  Math.round(enemyPower),
    };
  }

  // Ödül hesapla
  const baseCoin = FIGHT_BASE_COINS[encounter.owlTier] ?? 30;
  const baseXP   = FIGHT_BASE_XP[encounter.owlTier]   ?? 15;
  const { coins, xp } = calcReward(baseCoin, baseXP, playerPower, enemyPower);

  // Coin ve XP ver
  await Promise.all([
    prisma.player.update({
      where: { id: playerId },
      data: { coins: { increment: coins } },
    }),
    addXP(prisma, playerId, xp, 'encounterFight'),
  ]);

  return {
    playerWon:   true,
    rewardCoins: coins,
    rewardXP:    xp,
    enemyTier:   encounter.owlTier,
    enemyLevel:  Math.round(enemyPower),
  };
}
