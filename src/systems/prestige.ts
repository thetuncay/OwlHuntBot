import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import {
  PRESTIGE_MIN_STAT_AVG,
  PRESTIGE_LEVEL_REQ
} from '../config';
import { withLock } from '../utils/lock';
import { rehydratePlayerState } from '../state/player-state';

/**
 * Baykuşu feda ederek prestige seviyesini artırır.
 */
export async function performAscension(
  prisma: PrismaClient,
  playerId: string,
  owlId: string,
  redis?: Redis,
) {
  return withLock(playerId, 'ascension', async () => {
    const player = await prisma.player.findUnique({
      where: { id: playerId },
      select: { level: true, prestigeLevel: true }
    });

    if (!player) throw new Error('Oyuncu bulunamadı.');
    if (player.level < PRESTIGE_LEVEL_REQ) {
      throw new Error(`Ascension için en az **${PRESTIGE_LEVEL_REQ}** seviye olmalısın.`);
    }

    const owl = await prisma.owl.findUnique({
      where: { id: owlId }
    });

    if (!owl || owl.ownerId !== playerId) {
      throw new Error('Baykuş bulunamadı.');
    }

    // Stat kontrolü
    const avgStat = (owl.statGaga + owl.statGoz + owl.statKulak + owl.statKanat + owl.statPence) / 5;
    if (avgStat < PRESTIGE_MIN_STAT_AVG) {
      throw new Error(`Baykuşunun ortalama statı en az **${PRESTIGE_MIN_STAT_AVG}** olmalı (Şu an: ${avgStat.toFixed(1)}).`);
    }

    return prisma.$transaction(async (tx) => {
      // Baykuşu sil
      await tx.owl.delete({ where: { id: owlId } });

      // Prestige seviyesini artır ve oyuncuyu resetle
      await tx.player.update({
        where: { id: playerId },
        data: {
          prestigeLevel: { increment: 1 },
          level: 1,
          xp: 0,
          mainOwlId: null
        }
      });

      // Başlangıç baykuşu ver (Kukumav)
      const starter = await tx.owl.create({
        data: {
          ownerId: playerId,
          species: 'Kukumav baykusu',
          tier: 8,
          quality: 'Common',
          hp: 80,
          hpMax: 80,
          staminaCur: 85,
          statGaga: 10,
          statGoz: 10,
          statKulak: 10,
          statKanat: 10,
          statPence: 10,
          isMain: true
        }
      });

      await tx.player.update({
        where: { id: playerId },
        data: { mainOwlId: starter.id }
      });

      return { newPrestigeLevel: player.prestigeLevel + 1 };
    }).then(async (result) => {
      if (redis) {
        await rehydratePlayerState(redis, prisma, playerId);
      }
      return result;
    });
  });
}
