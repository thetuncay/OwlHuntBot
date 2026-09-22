import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import {
  GAMBLE_BJ_BLACKJACK_PAYOUT,
  GAMBLE_BJ_WIN_PAYOUT,
  GAMBLE_COINFLIP_PAYOUT,
  GAMBLE_COINFLIP_WIN_CHANCE,
} from '../config';
import type { GambleResult } from '../types';
import { finalWinChance } from '../utils/math';
import { withLock } from '../utils/lock';
import { weightedRandom } from '../utils/rng';
import { hydratePlayerState, applyCoinDeltaInRedis } from '../state/player-state';
import { enqueueDbWrite } from '../utils/db-queue';
import { recordWealthDelta } from './leaderboard';
import { writeAudit } from '../utils/audit';
import { validateGambleBet } from './gamble/validate-bet';
import { buildLossReliefNote, streakChanceModifier } from './gamble/win-chance-explain';
import { recordGambleOutcome, type GambleGame } from './gamble/gamble-stats';
import { rollSlotOutcome, buildSlotReels, calcSlotCoinGain } from './gamble/slot-engine';
import { fireQuest, trackEarnCoinsQuests, fireQuestBatch } from './quest-tracker';
import { mergeQuestNotices } from './daily-quests';
import { runDetached } from '../utils/async';
import { getGambleRetentionBonusSafe } from './retention/retention-modifiers';
import { trackSessionLoss } from './retention/player-activity';

// Atlas M0 uyumlu: $transaction kullanmaz, withLock yeterli.

/**
 * Seri kaynaklı şans düzeltmesi.
 *
 * Tanım `gamble/win-chance-explain.ts` içinde tutulur; oyuncuya gösterilen
 * açıklama ile hesaplanan değer ayrışmasın (M1 · M2).
 */
const streakModifier = streakChanceModifier;

/**
 * Kumar sonucunu M1 istatistik sayaçlarına yazar.
 *
 * Sıcak yolu bloklamaz; Redis yoksa sessizce atlanır.
 *
 * @param redis Redis bağlantısı (opsiyonel — DB-only yolda yok)
 * @param playerId Oyuncu ID
 * @param game Oyun tipi
 * @param result Kumar sonucu
 * @param bet Bahis miktarı
 */
function trackGambleStats(
  redis: Redis | undefined,
  playerId: string,
  game: GambleGame,
  result: GambleResult,
  bet: number,
): void {
  if (!redis) return;
  runDetached('gamble-stats', () =>
    recordGambleOutcome(redis, playerId, game, result.win, bet, result.deltaCoins),
  );
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
      const betCheck = validateGambleBet(bet, { playerCoins: player.coins });
      if (!betCheck.ok) throw new Error(betCheck.message ?? 'Bahis geçersiz.');
      if (player.coins < bet) throw new Error('Yetersiz bakiye.');

      const streakLossesBefore = player.gambleStreakLosses ?? 0;
      const baseModifier = streakModifier(player.gambleStreakWins ?? 0, streakLossesBefore);
      const retentionMod = await getGambleRetentionBonusSafe(redis, playerId, prisma);
      const retentionPts = Math.round(retentionMod * 100);
      const modifier = baseModifier + retentionPts;
      const chance = finalWinChance(baseChance, player.coins, bet, modifier);
      const win = Math.random() * 100 < chance;
      const gain = win ? Math.floor(bet * payout) - bet : -bet;
      const finalCoins = await applyCoinDeltaInRedis(redis, playerId, gain, prisma);

      if (!win) {
        runDetached('pa-loss', () => trackSessionLoss(redis, playerId));
      }

      enqueueDbWrite({
        type: 'updatePlayer',
        playerId,
        data: {
          gambleStreakWins: win ? { increment: 1 } : 0,
          gambleStreakLosses: win ? 0 : { increment: 1 },
        },
      });

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

      // Koruma bu turda uygulandı; oyuncu neden şansının arttığını görsün (M2).
      const reliefNote = buildLossReliefNote(streakLossesBefore);

      return {
        win,
        deltaCoins: gain,
        finalCoins,
        message: win ? winMessage : loseMessage,
        ...(reliefNote ? { lossReliefNote: reliefNote } : {}),
      };
    }

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new Error('Oyuncu bulunamadi.');
    const betCheck = validateGambleBet(bet, { playerCoins: player.coins });
    if (!betCheck.ok) throw new Error(betCheck.message ?? 'Bahis geçersiz.');
    if (player.coins < bet) throw new Error('Yetersiz bakiye.');

    const streakMod = streakModifier(player.gambleStreakWins, player.gambleStreakLosses);
    const chance = finalWinChance(baseChance, player.coins, bet, streakMod);
    const win = Math.random() * 100 < chance;
    const gain = win ? Math.floor(bet * payout) - bet : -bet;

    const updated = await prisma.player.update({
      where: { id: playerId },
      data: {
        coins: { increment: gain },
        gambleStreakWins: win ? { increment: 1 } : 0,
        gambleStreakLosses: win ? 0 : { increment: 1 },
      },
    });

    await recordWealthDelta(prisma, undefined, playerId, gain);

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
  const result = await settleGamble(
    prisma,
    playerId,
    bet,
    GAMBLE_COINFLIP_WIN_CHANCE,
    GAMBLE_COINFLIP_PAYOUT,
    'Coinflip kazandin.',
    'Coinflip kaybettin.',
    redis,
  );
  trackGambleStats(redis, playerId, 'cf', result, bet);
  runDetached('cf-quests', async () => {
    if (result.win) {
      const gain = result.deltaCoins > 0 ? result.deltaCoins : 0;
      await fireQuestBatch(prisma, playerId, [
        { type: 'cf', amount: 1 },
        { type: 'gamble_win', amount: 1 },
        { type: 'earn_coins', amount: gain },
      ], redis);
    } else {
      await fireQuest(prisma, playerId, 'cf', 1, undefined, redis);
    }
  });
  return result;
}

export async function slot(
  prisma: PrismaClient,
  playerId: string,
  bet: number,
  redis?: Redis,
): Promise<GambleResult> {
  const result = await withLock(playerId, 'financial', async () => {
    if (redis) {
      const bundle = await hydratePlayerState(redis, prisma, playerId);
      if (!bundle) throw new Error('Oyuncu bulunamadi.');
      const player = bundle.player;
      const betCheck = validateGambleBet(bet, { playerCoins: player.coins });
      if (!betCheck.ok) throw new Error(betCheck.message ?? 'Bahis geçersiz.');
      if (player.coins < bet) throw new Error('Yetersiz bakiye.');

      const roll = rollSlotOutcome();
      const payout = roll.payout;
      const gain = calcSlotCoinGain(bet, payout);
      const win = gain > 0;
      const finalCoins = await applyCoinDeltaInRedis(redis, playerId, gain, prisma);
      const symbols = buildSlotReels(roll.symbolKey);

      enqueueDbWrite({
        type: 'updatePlayer',
        playerId,
        data: {
          gambleStreakWins: win ? { increment: 1 } : 0,
          gambleStreakLosses: win ? 0 : { increment: 1 },
        },
      });

      return {
        win,
        deltaCoins: gain,
        finalCoins,
        message: roll.label,
        slotSymbolKey: roll.symbolKey,
        slotSymbolKeys: symbols,
        slotLabel: roll.label,
        slotJackpot: roll.symbolKey === 'owl',
      };
    }

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    if (!player) throw new Error('Oyuncu bulunamadi.');
    const betCheck = validateGambleBet(bet, { playerCoins: player.coins });
    if (!betCheck.ok) throw new Error(betCheck.message ?? 'Bahis geçersiz.');
    if (player.coins < bet) throw new Error('Yetersiz bakiye.');

    // FIX: applyHouseChance kaldırıldı — slot sonucu artık şeffaf
    // Oyuncu kazanan kombinasyon görürse gerçekten kazanır
    // RTP doğrudan SLOT_TABLE'dan hesaplanır (~45%)
    const roll = rollSlotOutcome();
    const payout = roll.payout;
    const gain = calcSlotCoinGain(bet, payout);
    const win = gain > 0;
    const symbols = buildSlotReels(roll.symbolKey);

    const updated = await prisma.player.update({
      where: { id: playerId },
      data: {
        coins: { increment: gain },
        gambleStreakWins:   win ? { increment: 1 } : 0,
        gambleStreakLosses: win ? 0 : { increment: 1 },
      },
    });

    await recordWealthDelta(prisma, undefined, playerId, gain);

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
      slotResult: roll.label,
    }).catch(console.error);

    return {
      win,
      deltaCoins: gain,
      finalCoins: updated.coins,
      message: roll.label,
      slotSymbolKey: roll.symbolKey,
      slotSymbolKeys: symbols,
      slotLabel: roll.label,
      slotJackpot: roll.symbolKey === 'owl',
    };
  });
  trackGambleStats(redis, playerId, 'slot', result, bet);
  if (result.win) {
    const gain = result.deltaCoins > 0 ? result.deltaCoins : 0;
    await mergeQuestNotices(
      await fireQuest(prisma, playerId, 'slot', 1),
      await fireQuest(prisma, playerId, 'gamble_win', 1),
      await trackEarnCoinsQuests(prisma, playerId, gain),
    );
  } else {
    await fireQuest(prisma, playerId, 'slot', 1);
  }
  return result;
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
  const result = await settleBlackjackInner(prisma, playerId, bet, outcome, redis);
  // Berabere el bahis riski taşımaz — istatistiği çarpıtmasın.
  if (outcome !== 'tie') trackGambleStats(redis, playerId, 'bj', result, bet);
  return result;
}

async function settleBlackjackInner(
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
    const betCheck = validateGambleBet(bet, { playerCoins: player.coins });
    if (!betCheck.ok) throw new Error(betCheck.message ?? 'Bahis geçersiz.');
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
  const result = await withLock(playerId, 'financial', async () => {
    let cachedBundle: Awaited<ReturnType<typeof hydratePlayerState>> = null;
    if (redis) {
      const bundle = await hydratePlayerState(redis, prisma, playerId);
      if (!bundle) throw new Error('Oyuncu bulunamadi.');
      if (bundle.player.coins < bet) throw new Error('Yetersiz bakiye.');
      cachedBundle = bundle;
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
      const player = cachedBundle?.player;
      if (!player) throw new Error('Oyuncu bulunamadi.');
      const finalCoins = await applyCoinDeltaInRedis(redis, playerId, gain, prisma);

      enqueueDbWrite({
        type: 'updatePlayer',
        playerId,
        data: {
          gambleStreakWins: win ? { increment: 1 } : 0,
          gambleStreakLosses: win ? 0 : { increment: 1 },
        },
      });

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

    await recordWealthDelta(prisma, undefined, playerId, gain);

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
  trackGambleStats(redis, playerId, 'bj', result, bet);
  if (result.win) {
    const gain = result.deltaCoins > 0 ? result.deltaCoins : 0;
    await mergeQuestNotices(
      await fireQuest(prisma, playerId, 'bj', 1),
      await fireQuest(prisma, playerId, 'gamble_win', 1),
      await trackEarnCoinsQuests(prisma, playerId, gain),
    );
  } else {
    await fireQuest(prisma, playerId, 'bj', 1);
  }
  return result;
}
