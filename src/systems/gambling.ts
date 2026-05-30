import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import {
  GAMBLE_BJ_BLACKJACK_PAYOUT,
  GAMBLE_BJ_WIN_PAYOUT,
  GAMBLE_COINFLIP_PAYOUT,
  GAMBLE_COINFLIP_WIN_CHANCE,
  GAMBLE_SLOT_HIDDEN_JACKPOT,
  GAMBLE_STREAK_LOSS_3,
  GAMBLE_STREAK_LOSS_5,
  GAMBLE_STREAK_WIN_3,
  GAMBLE_STREAK_WIN_5,
  SLOT_TABLE,
} from '../config';
import type { GambleResult } from '../types';
import { finalWinChance } from '../utils/math';
import { withLock } from '../utils/lock';
import { weightedRandom } from '../utils/rng';
import { hydratePlayerState, applyCoinDeltaInRedis } from '../state/player-state';
import { enqueueDbWrite } from '../utils/db-queue';
import { recordCoinsEarned } from './leaderboard';
import { writeAudit } from '../utils/audit';

// Atlas M0 uyumlu: $transaction kullanmaz, withLock yeterli.

function streakModifier(streakWins: number, streakLosses: number): number {
  if (streakLosses >= 5) return GAMBLE_STREAK_LOSS_5;
  if (streakLosses >= 3) return GAMBLE_STREAK_LOSS_3;
  if (streakWins >= 5) return GAMBLE_STREAK_WIN_5;
  if (streakWins >= 3) return GAMBLE_STREAK_WIN_3;
  return 0;
}

async function settleGamble(
  prisma: PrismaClient,
  playerId: string,
  bet: number,
  baseChance: number,
  payout: number,
  winMessage: string,
  loseMessage: string,
  redis?: Redis,
): Promise<GambleResult> {
  return withLock(playerId, 'financial', async () => {
    if (redis) {
      const bundle = await hydratePlayerState(redis, prisma, playerId);
      if (!bundle) throw new Error('Oyuncu bulunamadi.');
      const player = bundle.player;
      if (player.coins < bet) throw new Error('Yetersiz bakiye.');

      const streakMod = streakModifier(player.gambleStreakWins ?? 0, player.gambleStreakLosses ?? 0);
      const chance = finalWinChance(baseChance, player.coins, bet, streakMod);
      const win = Math.random() * 100 < chance;
      const gain = win ? Math.floor(bet * payout) - bet : -bet;
      const finalCoins = await applyCoinDeltaInRedis(redis, playerId, gain, prisma);

      enqueueDbWrite({
        type: 'updatePlayer',
        playerId,
        data: {
          gambleStreakWins: win ? { increment: 1 } : 0,
          gambleStreakLosses: win ? 0 : { increment: 1 },
        },
      });

      if (win && gain > 0) {
        recordCoinsEarned(prisma, playerId, gain).catch(() => null);
      }

      writeAudit(prisma, playerId, 'gamble', {
        coins: player.coins,
        gambleStreakWins: player.gambleStreakWins,
        gambleStreakLosses: player.gambleStreakLosses,
      }, {
        coins: finalCoins,
        bet,
        win,
        gain,
      }).catch(console.error);

      return {
        win,
        deltaCoins: gain,
        finalCoins,
        message: win ? winMessage : loseMessage,
      };
    }

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new Error('Oyuncu bulunamadi.');
    if (player.coins < bet) throw new Error('Yetersiz bakiye.');

    const streakMod = streakModifier(player.gambleStreakWins, player.gambleStreakLosses);
    const chance = finalWinChance(baseChance, player.coins, bet, streakMod);
    const win = Math.random() * 100 < chance;
    const gain = win ? Math.floor(bet * payout) - bet : -bet;

    const updated = await prisma.player.update({
      where: { id: playerId },
      data: {
        coins: { increment: gain },
        gambleStreakWins:   win ? { increment: 1 } : 0,
        gambleStreakLosses: win ? 0 : { increment: 1 },
      },
    });

    if (win && gain > 0) {
      recordCoinsEarned(prisma, playerId, gain).catch(() => null);
    }

    // Audit: gamble sonucu (fire-and-forget)
    writeAudit(prisma, playerId, 'gamble', {
      coins: player.coins,
      gambleStreakWins: player.gambleStreakWins,
      gambleStreakLosses: player.gambleStreakLosses,
    }, {
      coins: updated.coins,
      gambleStreakWins: updated.gambleStreakWins,
      gambleStreakLosses: updated.gambleStreakLosses,
      bet,
      win,
      gain,
    }).catch(console.error);

    return {
      win,
      deltaCoins: gain,
      finalCoins: updated.coins,
      message: win ? winMessage : loseMessage,
    };
  });
}

export async function coinFlip(
  prisma: PrismaClient,
  playerId: string,
  bet: number,
  redis?: Redis,
): Promise<GambleResult> {
  return settleGamble(prisma, playerId, bet, GAMBLE_COINFLIP_WIN_CHANCE, GAMBLE_COINFLIP_PAYOUT, 'Coinflip kazandin.', 'Coinflip kaybettin.', redis);
}

export async function slot(
  prisma: PrismaClient,
  playerId: string,
  bet: number,
  redis?: Redis,
): Promise<GambleResult> {
  return withLock(playerId, 'financial', async () => {
    if (redis) {
      const bundle = await hydratePlayerState(redis, prisma, playerId);
      if (!bundle) throw new Error('Oyuncu bulunamadi.');
      const player = bundle.player;
      if (player.coins < bet) throw new Error('Yetersiz bakiye.');

      const roll = weightedRandom(SLOT_TABLE.map((entry) => ({ value: entry, weight: entry.chance })));
      const jackpot = Math.random() * 100 < GAMBLE_SLOT_HIDDEN_JACKPOT;
      const payout = jackpot ? roll.payout * 2 : roll.payout;
      const gain = Math.floor(bet * payout) - bet;
      const win = gain > 0;
      const finalCoins = await applyCoinDeltaInRedis(redis, playerId, gain, prisma);

      enqueueDbWrite({
        type: 'updatePlayer',
        playerId,
        data: {
          gambleStreakWins: win ? { increment: 1 } : 0,
          gambleStreakLosses: win ? 0 : { increment: 1 },
        },
      });

      if (win && gain > 0) {
        recordCoinsEarned(prisma, playerId, gain).catch(() => null);
      }

      return {
        win,
        deltaCoins: gain,
        finalCoins,
        message: jackpot ? `${roll.name} + Gizli Jackpot!` : roll.name,
      };
    }

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new Error('Oyuncu bulunamadi.');
    if (player.coins < bet) throw new Error('Yetersiz bakiye.');

    // FIX: applyHouseChance kaldırıldı — slot sonucu artık şeffaf
    // Oyuncu kazanan kombinasyon görürse gerçekten kazanır
    // RTP doğrudan SLOT_TABLE'dan hesaplanır (~45%)
    const roll = weightedRandom(SLOT_TABLE.map((entry) => ({ value: entry, weight: entry.chance })));
    const jackpot = Math.random() * 100 < GAMBLE_SLOT_HIDDEN_JACKPOT;
    const payout = jackpot ? roll.payout * 2 : roll.payout;
    const gain = Math.floor(bet * payout) - bet;
    const win = gain > 0;

    const updated = await prisma.player.update({
      where: { id: playerId },
      data: {
        coins: { increment: gain },
        gambleStreakWins:   win ? { increment: 1 } : 0,
        gambleStreakLosses: win ? 0 : { increment: 1 },
      },
    });

    if (win && gain > 0) {
      recordCoinsEarned(prisma, playerId, gain).catch(() => null);
    }

    // Audit: slot sonucu (fire-and-forget)
    writeAudit(prisma, playerId, 'gamble', {
      coins: player.coins,
      gambleStreakWins: player.gambleStreakWins,
      gambleStreakLosses: player.gambleStreakLosses,
    }, {
      coins: updated.coins,
      gambleStreakWins: updated.gambleStreakWins,
      gambleStreakLosses: updated.gambleStreakLosses,
      bet,
      win,
      gain,
      slotResult: roll.name,
    }).catch(console.error);

    return {
      win,
      deltaCoins: gain,
      finalCoins: updated.coins,
      message: jackpot ? `${roll.name} + Gizli Jackpot!` : roll.name,
    };
  });
}

/**
 * Standart 52 kartlık desteden rastgele kart çeker.
 * FIX: Eski kod 62% yüksek kart bias uyguluyordu (gerçek: 30.8%).
 * Yeni kod gerçek deste dağılımını simüle eder:
 *   - 4 adet As (11 puan, bust durumunda 1'e düşer)
 *   - 16 adet 10-değerli kart (10, J, Q, K)
 *   - 4'er adet 2-9
 * playerHand parametresi artık kullanılmıyor — her iki taraf aynı desteden çeker.
 * NOT: Bu fonksiyon gambling.ts'teki auto-resolve blackjack için kullanılır.
 * Interaktif bj.ts komutu kendi kart döngüsüne sahip.
 */
function drawCard(): number {
  // 52 kartlık deste: 4×As, 4×2, 4×3, ..., 4×9, 16×10-değerli
  const roll = Math.floor(Math.random() * 13) + 1; // 1-13 arası
  if (roll === 1) return 11;   // As = 11 (bust durumunda 1'e düşer)
  if (roll >= 10) return 10;   // 10, J, Q, K = 10
  return roll;                  // 2-9 = yüz değeri
}

function handValue(cards: number[]): number {
  let total = cards.reduce((sum, card) => sum + card, 0);
  let aces = cards.filter((c) => c === 11).length;
  while (total > 21 && aces > 0) { total -= 10; aces -= 1; }
  return total;
}

export async function settleBlackjack(
  prisma: PrismaClient,
  playerId: string,
  bet: number,
  outcome: 'win' | 'lose' | 'tie',
  redis?: Redis,
): Promise<GambleResult> {
  return withLock(playerId, 'financial', async () => {
    const gain =
      outcome === 'win' ? Math.floor(bet * GAMBLE_BJ_WIN_PAYOUT) - bet :
      outcome === 'tie' ? 0 : -bet;

    if (redis) {
      const bundle = await hydratePlayerState(redis, prisma, playerId);
      if (!bundle) throw new Error('Oyuncu bulunamadi.');
      if (bundle.player.coins < bet) throw new Error('Yetersiz bakiye.');

      const finalCoins = await applyCoinDeltaInRedis(redis, playerId, gain, prisma);

      enqueueDbWrite({
        type: 'updatePlayer',
        playerId,
        data: {
          gambleStreakWins:   outcome === 'win' ? { increment: 1 } : 0,
          gambleStreakLosses: outcome === 'win' ? 0 : { increment: 1 },
        },
      });

      writeAudit(prisma, playerId, 'gamble', {
        coins: bundle.player.coins,
        gambleStreakWins: bundle.player.gambleStreakWins,
        gambleStreakLosses: bundle.player.gambleStreakLosses,
      }, {
        coins: finalCoins,
        bet,
        win: outcome === 'win',
        gain,
        game: 'blackjack',
      }).catch(console.error);

      return { win: outcome === 'win', deltaCoins: gain, finalCoins, message: outcome };
    }

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new Error('Oyuncu bulunamadi.');
    if (player.coins < bet) throw new Error('Yetersiz bakiye.');

    const updated = await prisma.player.update({
      where: { id: playerId },
      data: {
        coins: { increment: gain },
        gambleStreakWins:   outcome === 'win' ? { increment: 1 } : 0,
        gambleStreakLosses: outcome === 'win' ? 0 : { increment: 1 },
      },
    });

    // Audit: blackjack settle sonucu (fire-and-forget)
    writeAudit(prisma, playerId, 'gamble', {
      coins: player.coins,
      gambleStreakWins: player.gambleStreakWins,
      gambleStreakLosses: player.gambleStreakLosses,
    }, {
      coins: updated.coins,
      gambleStreakWins: updated.gambleStreakWins,
      gambleStreakLosses: updated.gambleStreakLosses,
      bet,
      win: outcome === 'win',
      gain,
      game: 'blackjack',
    }).catch(console.error);

    return { win: outcome === 'win', deltaCoins: gain, finalCoins: updated.coins, message: outcome };
  });
}

export async function blackjack(prisma: PrismaClient, playerId: string, bet: number, redis?: Redis): Promise<GambleResult> {
  return withLock(playerId, 'financial', async () => {
    if (redis) {
      const bundle = await hydratePlayerState(redis, prisma, playerId);
      if (!bundle) throw new Error('Oyuncu bulunamadi.');
      if (bundle.player.coins < bet) throw new Error('Yetersiz bakiye.');
    } else {
      const player = await prisma.player.findUnique({ where: { id: playerId } });
      if (!player) throw new Error('Oyuncu bulunamadi.');
      if (player.coins < bet) throw new Error('Yetersiz bakiye.');
    }

    const playerCards = [drawCard(), drawCard()];
    const dealerCards = [drawCard(), drawCard()];
    while (handValue(playerCards) < 12) playerCards.push(drawCard());
    while (handValue(dealerCards) < 17 || (handValue(dealerCards) === 17 && dealerCards.includes(11))) dealerCards.push(drawCard());

    const playerScore = handValue(playerCards);
    const dealerScore = handValue(dealerCards);
    const playerBlackjack = playerCards.length === 2 && playerScore === 21;

    let payout = 0;
    let win = false;
    if (playerScore <= 21) {
      if (dealerScore > 21 || playerScore > dealerScore) {
        win = true;
        payout = playerBlackjack ? GAMBLE_BJ_BLACKJACK_PAYOUT : GAMBLE_BJ_WIN_PAYOUT;
      } else if (playerScore === dealerScore) {
        payout = 1;
      }
    }

    const gain = win ? Math.floor(bet * payout) - bet : -bet;

    if (redis) {
      const bundle = await hydratePlayerState(redis, prisma, playerId);
      const player = bundle!.player;
      const finalCoins = await applyCoinDeltaInRedis(redis, playerId, gain, prisma);

      enqueueDbWrite({
        type: 'updatePlayer',
        playerId,
        data: {
          gambleStreakWins: win ? { increment: 1 } : 0,
          gambleStreakLosses: win ? 0 : { increment: 1 },
        },
      });

      if (win && gain > 0) {
        recordCoinsEarned(prisma, playerId, gain).catch(() => null);
      }

      writeAudit(prisma, playerId, 'gamble', {
        coins: player.coins,
        gambleStreakWins: player.gambleStreakWins,
        gambleStreakLosses: player.gambleStreakLosses,
      }, {
        coins: finalCoins,
        bet,
        win,
        gain,
        game: 'blackjack-auto',
        playerScore,
        dealerScore,
      }).catch(console.error);

      return {
        win,
        deltaCoins: gain,
        finalCoins,
        message: `Blackjack sonuc: Oyuncu ${playerScore} - Dealer ${dealerScore}`,
      };
    }

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new Error('Oyuncu bulunamadi.');

    const updated = await prisma.player.update({
      where: { id: playerId },
      data: {
        coins: { increment: gain },
        gambleStreakWins:   win ? { increment: 1 } : 0,
        gambleStreakLosses: win ? 0 : { increment: 1 },
      },
    });

    if (win && gain > 0) {
      recordCoinsEarned(prisma, playerId, gain).catch(() => null);
    }

    // Audit: blackjack auto-resolve sonucu (fire-and-forget)
    writeAudit(prisma, playerId, 'gamble', {
      coins: player.coins,
      gambleStreakWins: player.gambleStreakWins,
      gambleStreakLosses: player.gambleStreakLosses,
    }, {
      coins: updated.coins,
      gambleStreakWins: updated.gambleStreakWins,
      gambleStreakLosses: updated.gambleStreakLosses,
      bet,
      win,
      gain,
      game: 'blackjack-auto',
      playerScore,
      dealerScore,
    }).catch(console.error);

    return {
      win,
      deltaCoins: gain,
      finalCoins: updated.coins,
      message: `Blackjack sonuc: Oyuncu ${playerScore} - Dealer ${dealerScore}`,
    };
  });
}
