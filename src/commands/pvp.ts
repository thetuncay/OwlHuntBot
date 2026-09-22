/**
 * pvp.ts — Sosyal PvP Kumar Komutları (UI Katmanı)
 *
 * Komutlar:
 *   owl slot @oyuncu <miktar>  — Slot Yarışması
 *   owl bj @oyuncu <miktar>    — Blackjack Pro
 *
 * Mimari:
 *   - Bu dosya yalnızca Discord UI (Embed, Button, Collector) içerir.
 *   - İş mantığı src/systems/PvPGamblingSystem.ts'de.
 *   - Matematiksel hesaplamalar src/utils/math.ts'de.
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  type TextChannel,
  type Message,
  type ButtonInteraction,
} from 'discord.js';
import { randomUUID } from 'crypto';
import { COIN_EMOJI, formatCoinLabel, formatXpLabel } from '../config/ui-emojis';
import {
  validateInvite,
  saveSession,
  getSession,
  updateSession,
  deleteSession,
  settleSlotRace,
  settleBlackjackPro,
  settleCoinFlip,
  calcHouseCutRate,
  buildDeck,
  dealInitialHands,
  hitCard,
  calcHandValue,
  pvpGambleCooldownKey,
  type PvpGamblingSession,
  type PvpGamblingResult,
} from '../systems/PvPGamblingSystem';
import { formatSignedCoinLine, resultPipe } from '../utils/result-ux';
import type { CommandContext } from '../types';
import {
  PVP_GAMBLE_COOLDOWN_MS,
  PVP_GAMBLE_INVITE_TTL_MS,
  PVP_BJ_HIGH_STAKES_THRESHOLD,
  PVP_BJ_TURN_TTL_MS,
  COLOR_SUCCESS,
  COLOR_FAIL,
  COLOR_WARNING,
} from '../config';
import { armCooldown, peekCooldown } from '../middleware/cooldown-manager';
import { notifyInflightBusy, replyWithSuppression, SuppressionKeys } from '../utils/guarded-discord';
import { buildCooldownMessage } from '../utils/command-error';
import { acquireInFlightAction, releaseInFlightAction } from '../utils/response-suppression';
import {
  buildSlotHelpMessage,
  buildSlotLine,
  buildPvpSlotSpinText,
  buildSlotResultScreen,
  buildSlotSpinText,
  animateSlotReels,
  animatePvpSlotReels,
} from '../utils/slot-ux';
import {
  buildPvpCoinFlipResultText,
  buildPvpCoinFlipSpinText,
} from '../utils/coinflip-ux';
import { awaitMinGifSpin } from '../utils/gamble-ux';
import { PVP_CF_SPIN_MS } from '../config';
import { resolveGambleBetFromArgs } from '../systems/gamble/resolve-bet-args';

const GAMBLE_BET_USAGE = '<miktar|all>';

const SEP_PVP = '─────────────────────';

type PvpGambleMode = PvpGamblingSession['mode'];

/**
 * PvP davet embed — mod açıklaması (alt satır alıntı).
 * Boş string = sadece davet cümlesi gösterilir.
 */
export const PVP_MODE_DESC: Record<PvpGambleMode, string> = {
  coinflip: '',
  slot: '',
  blackjack: '',
};

/**
 * Davet kabul edildikten sonra buton mesajının yerine geçen kısa metin.
 * Boş string = mesaj edit edilmez (embed + butonlar kalır).
 */
export function buildPvpGameStartMessage(challengerName: string, defenderName: string): string {
  return `⚔️ **${challengerName}** vs **${defenderName}**`;
}

/**
 * Coin flip seri kazanç duyurusu — null dönerse ek mesaj gönderilmez.
 */
export function buildPvpCfStreakAnnounce(winnerName: string, streak: number): string | null {
  void winnerName;
  void streak;
  return null;
}

/** PvP kumar davet embed'i — Copy Editor önizlemesi için export */
export function buildPvpInviteEmbed(
  mode: PvpGamblingSession['mode'],
  challengerName: string,
  defenderName: string,
  bet: number,
  houseCutRate: number,
): EmbedBuilder {
  const modeLabel = {
    coinflip: '🪙 Coin Flip',
    slot: `🦉 Slot Yarışması`,
    blackjack: `🃏 Blackjack`,
  }[mode];
  const modeDesc = PVP_MODE_DESC[mode];
  const winnableAmount = Math.floor(bet * 2 * (1 - houseCutRate));

  const description = modeDesc
    ? `**${challengerName}** seni meydan okumaya davet ediyor!\n> ${modeDesc}`
    : `**${challengerName}** seni meydan okumaya davet ediyor!`;

  return new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle(`⚔️ PvP Daveti — ${modeLabel}`)
    .setDescription(description)
    .addFields(
      { name: `${COIN_EMOJI} Bahis`,        value: formatCoinLabel(bet), inline: true },
      { name: '🏦 Kasa Payı',    value: `%${(houseCutRate * 100).toFixed(0)}`,         inline: true },
      { name: '🏆 Kazanılabilir', value: formatCoinLabel(winnableAmount), inline: true },
    )
    .setFooter({ text: `${defenderName} — 30 saniye içinde yanıtla` })
    .setTimestamp();
}

/** PvP slot yarışması sonuç ekranı */
export function buildPvpSlotResultText(
  result: PvpGamblingResult,
  challengerName: string,
  defenderName: string,
  challengerId: string,
): string {
  const isPush = result.winnerId === null;
  const winnerName = isPush ? null : result.winnerId === challengerId ? challengerName : defenderName;
  const loserName  = isPush ? null : winnerName === challengerName ? defenderName : challengerName;

  const cSymbols = buildSlotLine(result.slot!.challengerSymbols as [string, string, string]);
  const dSymbols = buildSlotLine(result.slot!.defenderSymbols as [string, string, string]);

  if (isPush) {
    return [
      `🎰 Berabere.`,
      '',
      resultPipe(challengerName),
      resultPipe(cSymbols),
      resultPipe(defenderName),
      resultPipe(dSymbols),
      '',
      resultPipe('Bahisler iade edildi'),
    ].join('\n');
  }

  const lines = [
    `🏆 **${winnerName}** kazandı.`,
    '',
    resultPipe(`${winnerName}: ${cSymbols}`),
    resultPipe(`${loserName}: ${dSymbols}`),
    formatSignedCoinLine(result.winnerGain),
    '',
    `☠️ **${loserName}**`,
  ];

  if (result.slot?.comboBonus) {
    lines.push(resultPipe(`✨ Combo → ${formatXpLabel(result.slot.comboXP)}`));
  }
  if (result.rebate) {
    lines.push(resultPipe(`🦉 Baykuş Tesellisi → ${formatCoinLabel(result.rebate.amount)}`));
  }

  return lines.join('\n');
}

/** Davet buton satırı */
function buildInviteRow(sessionId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`pvp_accept:${sessionId}`)
      .setLabel('✅ Kabul Et')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`pvp_reject:${sessionId}`)
      .setLabel('❌ Reddet')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`pvp_cancel:${sessionId}`)
      .setLabel('🚫 İptal')
      .setStyle(ButtonStyle.Secondary),
  );
}

/** Devre dışı bırakılmış buton satırı */
function buildDisabledRow(sessionId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`pvp_accept:${sessionId}`)
      .setLabel('✅ Kabul Et')
      .setStyle(ButtonStyle.Success)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`pvp_reject:${sessionId}`)
      .setLabel('❌ Reddet')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`pvp_cancel:${sessionId}`)
      .setLabel('🚫 İptal')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
  );
}

// ─── Blackjack Text Renderer'ları ────────────────────────────────────────────

/** Blackjack el — kompakt inline kartlar (backtick yok) */
function formatBjHandInline(cards: { rank: string; suit: string }[], hideFirst = false): string {
  if (hideFirst && cards.length >= 2) {
    return ['🂠', ...cards.slice(1).map((c) => `${c.rank}${c.suit}`)].join(' ');
  }
  return cards.map((c) => `${c.rank}${c.suit}`).join(' ');
}

/** PvP Blackjack — oyun sırasında gösterilen düz metin ekranı */
export function buildPvpBJGameScreen(
  session: PvpGamblingSession,
  challengerName: string,
  defenderName: string,
): string {
  const bj = session.bj!;
  const cHand = calcHandValue(bj.challengerHand);
  const dHand = calcHandValue(bj.defenderHand);
  const currentTurnId = bj.currentTurn === 'challenger' ? session.challengerId : session.defenderId;

  const hideCFromDefender = bj.currentTurn === 'defender' && !bj.challengerStood;
  const hideDFromChallenger = bj.currentTurn === 'challenger' && !bj.defenderStood;

  const showCTotal = bj.currentTurn === 'challenger' || bj.challengerStood;
  const showDTotal = bj.currentTurn === 'defender'   || bj.defenderStood;

  const cTotalStr = showCTotal
    ? (cHand.isBust ? 'BUST 💀' : cHand.isBlackjack ? '21 🎉' : String(cHand.total))
    : '?';
  const dTotalStr = showDTotal
    ? (dHand.isBust ? 'BUST 💀' : dHand.isBlackjack ? '21 🎉' : String(dHand.total))
    : '?';

  return [
    `🃏 <@${currentTurnId}>`,
    `🃏 Blackjack · ${formatCoinLabel(session.bet)}`,
    '',
    `${challengerName} [${cTotalStr}]`,
    formatBjHandInline(bj.challengerHand, hideCFromDefender),
    '',
    `${defenderName} [${dTotalStr}]`,
    formatBjHandInline(bj.defenderHand, hideDFromChallenger),
  ].join('\n');
}

/** Blackjack Hit/Stand buton satırı */
function buildBJActionRow(sessionId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`bj_hit:${sessionId}`)
      .setEmoji('👊')
      .setLabel('ÇEK')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`bj_stand:${sessionId}`)
      .setEmoji('🛑')
      .setLabel('DUR')
      .setStyle(ButtonStyle.Danger),
  );
}

/** Blackjack devre dışı buton satırı */
function buildBJDisabledRow(sessionId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`bj_hit:${sessionId}`)
      .setEmoji('👊')
      .setLabel('ÇEK')
      .setStyle(ButtonStyle.Success)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`bj_stand:${sessionId}`)
      .setEmoji('🛑')
      .setLabel('DUR')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true),
  );
}

/** PvP Blackjack — sonuç ekranı */
export function buildPvpBJResultScreen(
  result: PvpGamblingResult,
  challengerName: string,
  defenderName: string,
): string {
  const bj = result.blackjack!;

  const winnerName = bj.outcome === 'challenger_wins'
    ? challengerName
    : bj.outcome === 'defender_wins'
      ? defenderName
      : null;

  const cTotal = bj.challengerHand.isBust ? 'BUST 💀' : bj.challengerHand.isBlackjack ? '21 🎉' : String(bj.challengerHand.total);
  const dTotal = bj.defenderHand.isBust   ? 'BUST 💀' : bj.defenderHand.isBlackjack   ? '21 🎉' : String(bj.defenderHand.total);

  const outcomeLine = bj.outcome === 'push'
    ? `Beraberlik · ${formatCoinLabel(result.bet)} iade`
    : `**${winnerName}** kazandı · ${COIN_EMOJI} +${result.winnerGain.toLocaleString('tr-TR')} · toplam ${formatCoinLabel(result.bet + result.winnerGain)}`;

  const lines = [
    `🃏 **${winnerName ?? 'Beraberlik'}**`,
    `🃏 Blackjack · ${formatCoinLabel(result.bet)}`,
    '',
    `${challengerName} [${cTotal}]`,
    formatBjHandInline(bj.challengerHand.cards),
    '',
    `${defenderName} [${dTotal}]`,
    formatBjHandInline(bj.defenderHand.cards),
    '',
    outcomeLine,
  ];

  if (result.rebate) {
    lines.push('', `🦉 **Baykuş Tesellisi** — Üst üste ${result.rebate.lossStreak} kayıp → ${formatCoinLabel(result.rebate.amount)} iade`);
  }

  return lines.join('\n');
}

// ─── Davet Akışı (Ortak) ─────────────────────────────────────────────────────

/**
 * PvP davet akışını başlatır.
 * Challenger davet gönderir, Defender 30 saniye içinde yanıtlar.
 * Kabul edilirse oyun başlar, reddedilirse/zaman aşımında iptal edilir.
 */
async function runInviteFlow(
  message: Message,
  ctx: CommandContext,
  challengerId: string,
  challengerName: string,
  defenderId: string,
  defenderName: string,
  bet: number,
  mode: PvpGamblingSession['mode'],
): Promise<void> {
  const challengerCooldown = await peekCooldown(ctx.redis, pvpGambleCooldownKey(challengerId));
  if (challengerCooldown.active) {
    await replyWithSuppression(
      message,
      buildCooldownMessage(challengerCooldown.remainingMs, 'pvp_gamble', challengerName),
      SuppressionKeys.cooldown(pvpGambleCooldownKey(challengerId)),
    );
    return;
  }

  const defenderCooldown = await peekCooldown(ctx.redis, pvpGambleCooldownKey(defenderId));
  if (defenderCooldown.active) {
    await replyWithSuppression(
      message,
      buildCooldownMessage(defenderCooldown.remainingMs, 'pvp_gamble', defenderName),
      SuppressionKeys.cooldown(pvpGambleCooldownKey(defenderId)),
    );
    return;
  }

  // Ön doğrulama
  const validation = await validateInvite(ctx.prisma, ctx.redis, challengerId, defenderId, bet);
  if (!validation.valid) {
    await message.reply({
      content: `❌ **Oyun Başlatılamadı** — ${validation.error ?? 'Bilinmeyen hata.'}`,
    });
    return;
  }

  // Oturum oluştur
  const sessionId = randomUUID();
  const houseCutRate = await calcHouseCutRate(ctx.redis, challengerId, defenderId);

  const session: PvpGamblingSession = {
    sessionId,
    mode,
    challengerId,
    defenderId,
    bet,
    status: 'pending',
    createdAt: Date.now(),
  };
  await saveSession(ctx.redis, session);

  // Davet mesajı gönder
  const inviteMsg = await (message.channel as TextChannel).send({
    content: `<@${defenderId}>`,
    embeds: [buildPvpInviteEmbed(mode, challengerName, defenderName, bet, houseCutRate)],
    components: [buildInviteRow(sessionId)],
  });

  // Collector: 30 saniye
  const collector = inviteMsg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: PVP_GAMBLE_INVITE_TTL_MS,
    filter: (i) =>
      i.customId.startsWith('pvp_accept:') ||
      i.customId.startsWith('pvp_reject:') ||
      i.customId.startsWith('pvp_cancel:'),
  });

  collector.on('collect', async (i: Parameters<Parameters<ReturnType<typeof inviteMsg.createMessageComponentCollector>['on']>[1]>[0]) => {
    const [action] = i.customId.split(':');

    // Sadece ilgili oyuncular etkileşim kurabilir
    if (action === 'pvp_cancel' && i.user.id !== challengerId) {
      await i.reply({ content: '❌ Sadece davet eden iptal edebilir.', flags: 64 });
      return;
    }
    if ((action === 'pvp_accept' || action === 'pvp_reject') && i.user.id !== defenderId) {
      await i.reply({ content: '❌ Bu davet sana ait değil.', flags: 64 });
      return;
    }

    collector.stop(action ?? 'unknown');

    if (action === 'pvp_reject') {
      await deleteSession(ctx.redis, sessionId);
      await i.update({
        content: `🚫 **Davet Reddedildi** — **${defenderName}** daveti reddetti.`,
        embeds: [],
        components: [buildDisabledRow(sessionId)],
      });
      return;
    }

    if (action === 'pvp_cancel') {
      await deleteSession(ctx.redis, sessionId);
      await i.update({
        content: `🚫 **Davet İptal Edildi** — **${challengerName}** daveti iptal etti.`,
        embeds: [],
        components: [buildDisabledRow(sessionId)],
      });
      return;
    }

    if (action === 'pvp_accept') {
      const startContent = buildPvpGameStartMessage(challengerName, defenderName);
      await i.update({
        content: startContent,
        embeds: [],
        components: [buildDisabledRow(sessionId)],
      });

      // Moda göre oyunu başlat
      try {
        if (mode === 'coinflip') {
          await runCoinFlipGame(message, ctx, sessionId, challengerName, defenderName);
        } else if (mode === 'slot') {
          await runSlotRaceGame(message, ctx, sessionId, challengerName, defenderName);
        } else if (mode === 'blackjack') {
          await runBlackjackGame(message, ctx, sessionId, challengerName, defenderName);
        }
      } catch (err) {
        await deleteSession(ctx.redis, sessionId);
        await (message.channel as TextChannel).send({
          content: `❌ **Oyun Hatası** — ${err instanceof Error ? err.message : 'Beklenmeyen hata.'}`,
        });
      }
    }
  });

  collector.on('end', async (_: unknown, reason: string) => {
    if (reason === 'time') {
      await deleteSession(ctx.redis, sessionId);
      await inviteMsg.edit({
        content: `⏰ **Zaman Aşımı** — **${defenderName}** 30 saniye içinde yanıt vermedi. Davet iptal edildi.`,
        embeds: [],
        components: [buildDisabledRow(sessionId)],
      });
    }
  });
}

// ─── Oyun Akışları ────────────────────────────────────────────────────────────

async function runCoinFlipGame(
  message: Message,
  ctx: CommandContext,
  sessionId: string,
  challengerName: string,
  defenderName: string,
): Promise<void> {
  const session = await getSession(ctx.redis, sessionId);
  if (!session) throw new Error('Oturum bulunamadı.');

  const startedAt = Date.now();
  const animMsg = await (message.channel as TextChannel).send({
    content: buildPvpCoinFlipSpinText(challengerName, defenderName, session.bet),
  });

  const [result] = await Promise.all([
    settleCoinFlip(ctx.prisma, ctx.redis, session),
    awaitMinGifSpin(startedAt, PVP_CF_SPIN_MS),
  ]);
  await Promise.all([
    armCooldown(ctx.redis, pvpGambleCooldownKey(session.challengerId), PVP_GAMBLE_COOLDOWN_MS),
    armCooldown(ctx.redis, pvpGambleCooldownKey(session.defenderId), PVP_GAMBLE_COOLDOWN_MS),
  ]);

  const winnerName = result.coinflip?.winner === 'challenger' ? challengerName : defenderName;
  const loserName = result.coinflip?.winner === 'challenger' ? defenderName : challengerName;

  await animMsg.edit({
    content: buildPvpCoinFlipResultText({
      challengerName,
      defenderName,
      winnerName,
      loserName,
      winnerGain: result.winnerGain,
      loserLoss: result.loserLoss,
      bet: result.bet,
      resultFace: result.coinflip?.face ?? 'heads',
      rebate: result.rebate
        ? {
            lossStreak: result.rebate.lossStreak,
            amount: result.rebate.amount,
            playerName: loserName,
          }
        : null,
    }),
  });

  if (result.serialKiller) {
    const streakMsg = buildPvpCfStreakAnnounce(winnerName, result.cfStreak ?? 3);
    if (streakMsg) {
      await (message.channel as TextChannel).send({ content: streakMsg });
    }
  }
}

/** Slot Race oyun akışı */
async function runSlotRaceGame(
  message: Message,
  ctx: CommandContext,
  sessionId: string,
  challengerName: string,
  defenderName: string,
): Promise<void> {
  const session = await getSession(ctx.redis, sessionId);
  if (!session) throw new Error('Oturum bulunamadı.');

  const spinMsg = await (message.channel as TextChannel).send({
    content: buildPvpSlotSpinText(challengerName, defenderName, session.bet),
  });

  const result = await settleSlotRace(ctx.prisma, ctx.redis, session);
  const challengerFinal = result.slot!.challengerSymbols as [string, string, string];
  const defenderFinal = result.slot!.defenderSymbols as [string, string, string];

  await animatePvpSlotReels(
    (content) => spinMsg.edit({ content }).catch(() => null),
    { challengerName, defenderName, bet: session.bet, challengerFinal, defenderFinal },
  );

  await Promise.all([
    armCooldown(ctx.redis, pvpGambleCooldownKey(session.challengerId), PVP_GAMBLE_COOLDOWN_MS),
    armCooldown(ctx.redis, pvpGambleCooldownKey(session.defenderId), PVP_GAMBLE_COOLDOWN_MS),
  ]);

  await spinMsg.edit({
    content: buildPvpSlotResultText(result, challengerName, defenderName, session.challengerId),
  });
}

/** Blackjack Pro oyun akışı */
async function runBlackjackGame(
  message: Message,
  ctx: CommandContext,
  sessionId: string,
  challengerName: string,
  defenderName: string,
): Promise<void> {
  const session = await getSession(ctx.redis, sessionId);
  if (!session) throw new Error('Oturum bulunamadı.');

  // Deste oluştur ve dağıt
  const deck = buildDeck();
  const { challengerCards, defenderCards, remainingDeck } = dealInitialHands(deck);

  if (session.bet >= PVP_BJ_HIGH_STAKES_THRESHOLD) {
    await (message.channel as TextChannel).send({
      content: `### ⚠️ BÜYÜK BET ?!\n${SEP_PVP}\n**${challengerName}** vs **${defenderName}** \n${formatCoinLabel(session.bet)} bahisli Blackjack başladı!\n> 👁️ Beti izlemek için tıkla..`,
    });
  }

  // Oturumu BJ verileriyle güncelle
  const updatedSession = await updateSession(ctx.redis, sessionId, {
    status: 'active',
    bj: {
      challengerHand: challengerCards,
      defenderHand: defenderCards,
      deck: remainingDeck,
      currentTurn: 'challenger',
      challengerStood: false,
      defenderStood: false,
    },
  });
  if (!updatedSession) throw new Error('Oturum güncellenemedi.');

  // Oyun mesajını gönder — embed değil düz text
  const gameMsg = await (message.channel as TextChannel).send({
    content: buildPvpBJGameScreen(updatedSession, challengerName, defenderName),
    components: [buildBJActionRow(sessionId)],
  });

  // Sıralı hamle collector'ı — her hamle için PVP_BJ_TURN_TTL_MS
  const collector = gameMsg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: PVP_BJ_TURN_TTL_MS,
    filter: (i) =>
      (i.customId.startsWith('bj_hit:') || i.customId.startsWith('bj_stand:')) &&
      (i.user.id === session.challengerId || i.user.id === session.defenderId),
  });

  collector.on('collect', async (i: ButtonInteraction) => {
    const current = await getSession(ctx.redis, sessionId);
    if (!current?.bj) {
      await i.reply({ content: '❌ Oturum bulunamadı.', flags: 64 });
      return;
    }

    const isChallenger = i.user.id === session.challengerId;
    const isDefender = i.user.id === session.defenderId;
    const isCurrentTurn =
      (isChallenger && current.bj.currentTurn === 'challenger') ||
      (isDefender && current.bj.currentTurn === 'defender');

    if (!isCurrentTurn) {
      await i.reply({ content: '⏳ Şu an sıra sende değil.', flags: 64 });
      return;
    }

    // Hamle yapıldı — timer'ı sıfırla
    collector.resetTimer({ time: PVP_BJ_TURN_TTL_MS });

    const [action] = i.customId.split(':');
    const bjData = { ...current.bj };

    if (action === 'bj_hit') {
      // Kart çek
      const { card, remainingDeck: newDeck } = hitCard(bjData.deck);
      bjData.deck = newDeck;

      if (isChallenger) {
        bjData.challengerHand = [...bjData.challengerHand, card];
        const hand = calcHandValue(bjData.challengerHand);
        if (hand.isBust) {
          bjData.challengerStood = true; // Bust = otomatik stand
          bjData.currentTurn = 'defender';
        }
      } else {
        bjData.defenderHand = [...bjData.defenderHand, card];
        const hand = calcHandValue(bjData.defenderHand);
        if (hand.isBust) {
          bjData.defenderStood = true;
          bjData.currentTurn = 'challenger';
        }
      }
    } else if (action === 'bj_stand') {
      if (isChallenger) {
        bjData.challengerStood = true;
        bjData.currentTurn = 'defender';
      } else {
        bjData.defenderStood = true;
        bjData.currentTurn = 'challenger';
      }
    }

    // Her iki oyuncu da bitti mi?
    const bothDone = bjData.challengerStood && bjData.defenderStood;

    const newSession = await updateSession(ctx.redis, sessionId, { bj: bjData });
    if (!newSession) {
      await i.reply({ content: '❌ Oturum güncellenemedi.', flags: 64 });
      return;
    }

    if (bothDone) {
      collector.stop('game_over');
      const result = await settleBlackjackPro(ctx.prisma, ctx.redis, newSession);
      await Promise.all([
        armCooldown(ctx.redis, pvpGambleCooldownKey(session.challengerId), PVP_GAMBLE_COOLDOWN_MS),
        armCooldown(ctx.redis, pvpGambleCooldownKey(session.defenderId), PVP_GAMBLE_COOLDOWN_MS),
      ]);
      await i.update({
        content: buildPvpBJResultScreen(result, challengerName, defenderName),
        embeds: [],
        components: [buildBJDisabledRow(sessionId)],
      });
    } else {
      await i.update({
        content: buildPvpBJGameScreen(newSession, challengerName, defenderName),
        embeds: [],
        components: [buildBJActionRow(sessionId)],
      });
    }
  });

  collector.on('end', async (_: unknown, reason: string) => {
    if (reason === 'time') {
      const current = await getSession(ctx.redis, sessionId);
      if (current?.bj) {
        // Sadece sırası gelen (hareketsiz kalan) oyuncuyu stand yap
        // Diğer oyuncunun eli olduğu gibi kalır → 21'e en yakın kazanır
        const bjData = { ...current.bj };
        const timedOutName = bjData.currentTurn === 'challenger' ? challengerName : defenderName;

        // Sadece sırası gelen oyuncuyu stand yap, diğeri olduğu gibi kalır
        if (bjData.currentTurn === 'challenger') {
          bjData.challengerStood = true;
        } else {
          bjData.defenderStood = true;
        }
        // Her ikisi de artık done — settle et
        bjData.challengerStood = true;
        bjData.defenderStood   = true;

        const finalSession = await updateSession(ctx.redis, sessionId, { bj: bjData });
        if (finalSession) {
          const result = await settleBlackjackPro(ctx.prisma, ctx.redis, finalSession);
          await Promise.all([
            armCooldown(ctx.redis, pvpGambleCooldownKey(session.challengerId), PVP_GAMBLE_COOLDOWN_MS),
            armCooldown(ctx.redis, pvpGambleCooldownKey(session.defenderId), PVP_GAMBLE_COOLDOWN_MS),
          ]);
          const timeoutNote = `\n⏰ *${timedOutName} süre dolduğu için otomatik stand yaptı.*`;
          await gameMsg.edit({
            content: buildPvpBJResultScreen(result, challengerName, defenderName) + timeoutNote,
            embeds: [],
            components: [buildBJDisabledRow(sessionId)],
          });
        }
      }
    }
  });
}

/**
 * Mention veya ID'den hedef kullanıcıyı çözer.
 * Discord mention: <@123456789> veya <@!123456789>
 * Düz ID: 123456789
 */
function resolveTarget(message: Message, args: string[]): { id: string; name: string } | null {
  // Önce Discord'un parse ettiği mention'lara bak
  const mentioned = message.mentions.users.first();
  if (mentioned) return { id: mentioned.id, name: mentioned.displayName ?? mentioned.username };

  // Mention parse edilmediyse args'tan manuel çıkar
  for (const arg of args) {
    // <@123456789> veya <@!123456789> formatı
    const match = /^<@!?(\d+)>$/.exec(arg);
    if (match?.[1]) return { id: match[1], name: arg };
    // Düz ID (18+ haneli sayı)
    if (/^\d{17,20}$/.test(arg)) return { id: arg, name: arg };
  }
  return null;
}

// ─── Prefix Komut Giriş Noktaları ────────────────────────────────────────────

/**
 * Coin Flip — mention varsa PvP, yoksa solo (coinflip.ts)
 */
export async function runPvpCoinFlip(
  message: Message,
  args: string[],
  ctx: CommandContext,
): Promise<void> {
  const target = resolveTarget(message, args);

  if (!target) {
    const { runCfMessage } = await import('./coinflip.js');
    await runCfMessage(message, args, ctx);
    return;
  }

  const resolved = await resolveGambleBetFromArgs(ctx.prisma, ctx.redis, message.author.id, args);
  if (!resolved.ok) {
    await replyWithSuppression(
      message,
      resolved.hasToken ? `❌ ${resolved.message}` : `❌ Kullanım: \`owl cf @oyuncu ${GAMBLE_BET_USAGE}\``,
      SuppressionKeys.usage('cf', 'pvp'),
    );
    return;
  }
  if (target.id === message.author.id) {
    await replyWithSuppression(
      message,
      { content: '❌ **Geçersiz Hedef** — Kendine meydan okuyamazsın.' },
      SuppressionKeys.pvp('self-target'),
    );
    return;
  }
  const authorName = message.member?.displayName ?? message.author.username;
  await runInviteFlow(message, ctx, message.author.id, authorName, target.id, target.name, resolved.bet, 'coinflip');
}

/**
 * Slot — mention varsa PvP, yoksa solo (gambling.ts)
 */
export async function runPvpSlot(
  message: Message,
  args: string[],
  ctx: CommandContext,
): Promise<void> {
  const target = resolveTarget(message, args);

  // Solo mod
  if (!target) {
    const resolved = await resolveGambleBetFromArgs(ctx.prisma, ctx.redis, message.author.id, args);
    if (!resolved.ok) {
      if (!resolved.hasToken) {
        await message.reply(buildSlotHelpMessage());
        return;
      }
      await replyWithSuppression(
        message,
        `❌ ${resolved.message}`,
        SuppressionKeys.usage('slot', 'solo'),
      );
      return;
    }
    const bet = resolved.bet;
    const { slot } = await import('../systems/gambling.js');
    const gate = {
      userId: message.author.id,
      guildId: message.guildId,
      key: SuppressionKeys.state('slot-solo-inflight'),
    };
    if (!acquireInFlightAction(gate)) {
      const name = message.member?.displayName ?? message.author.displayName ?? message.author.username;
      await notifyInflightBusy(message, name, SuppressionKeys.state('slot-solo-inflight-busy'));
      return;
    }
    try {
      const playerName = message.member?.displayName ?? message.author.displayName ?? message.author.username;
      const sent = await message.reply(buildSlotSpinText(playerName, bet));

      const result = await slot(ctx.prisma, message.author.id, bet, ctx.redis);
      const finalSymbols = (result.slotSymbolKeys ?? [
        result.slotSymbolKey ?? 'poop',
        result.slotSymbolKey ?? 'poop',
        result.slotSymbolKey ?? 'poop',
      ]) as [string, string, string];

      await animateSlotReels(
        (content) => sent.edit({ content }).catch(() => null),
        { playerName, bet, finalSymbols },
      );

      await sent.edit(
        buildSlotResultScreen({
          playerName,
          bet,
          finalSymbols,
          win: result.win,
          deltaCoins: result.deltaCoins,
        }),
      ).catch(() => null);
    } catch (err) {
      await replyWithSuppression(
        message,
        `❌ ${err instanceof Error ? err.message : 'Hata'}`,
        SuppressionKeys.economy('slot-solo'),
      );
    } finally {
      releaseInFlightAction(gate);
    }
    return;
  }

  // PvP mod
  const resolved = await resolveGambleBetFromArgs(ctx.prisma, ctx.redis, message.author.id, args);
  if (!resolved.ok) {
    await replyWithSuppression(
      message,
      resolved.hasToken ? `❌ ${resolved.message}` : `❌ Kullanım: \`owl slot @oyuncu ${GAMBLE_BET_USAGE}\``,
      SuppressionKeys.usage('slot', 'pvp'),
    );
    return;
  }
  if (target.id === message.author.id) {
    await replyWithSuppression(
      message,
      { content: '❌ **Geçersiz Hedef** — Kendine meydan okuyamazsın.' },
      SuppressionKeys.pvp('self-target'),
    );
    return;
  }
  const authorName = message.member?.displayName ?? message.author.username;
  await runInviteFlow(message, ctx, message.author.id, authorName, target.id, target.name, resolved.bet, 'slot');
}

/**
 * Blackjack — mention varsa PvP, yoksa solo (bj.ts)
 */
export async function runPvpBlackjack(
  message: Message,
  args: string[],
  ctx: CommandContext,
): Promise<void> {
  const target = resolveTarget(message, args);

  // Solo mod — bj.ts'deki handler'a yönlendir
  if (!target) {
    const resolved = await resolveGambleBetFromArgs(ctx.prisma, ctx.redis, message.author.id, args);
    const bet = resolved.ok ? resolved.bet : undefined;
    const { handleBjTextCommand } = await import('./bj.js');
    if (!resolved.ok && resolved.hasToken) {
      await replyWithSuppression(
        message,
        `❌ ${resolved.message}`,
        SuppressionKeys.economy('bj-insufficient'),
      );
      return;
    }
    await handleBjTextCommand(message, bet, ctx);
    return;
  }

  // PvP mod
  const resolved = await resolveGambleBetFromArgs(ctx.prisma, ctx.redis, message.author.id, args);
  if (!resolved.ok) {
    await replyWithSuppression(
      message,
      resolved.hasToken ? `❌ ${resolved.message}` : `❌ Kullanım: \`owl bj @oyuncu ${GAMBLE_BET_USAGE}\``,
      SuppressionKeys.usage('bj', 'pvp'),
    );
    return;
  }
  if (target.id === message.author.id) {
    await replyWithSuppression(
      message,
      { content: '❌ **Geçersiz Hedef** — Kendine meydan okuyamazsın.' },
      SuppressionKeys.pvp('self-target'),
    );
    return;
  }
  const authorName = message.member?.displayName ?? message.author.username;
  await runInviteFlow(message, ctx, message.author.id, authorName, target.id, target.name, resolved.bet, 'blackjack');
}

