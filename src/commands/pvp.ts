/**
 * pvp.ts — Sosyal PvP Kumar Komutları (UI Katmanı)
 *
 * Komutlar:
 *   owl cf @oyuncu <miktar>    — Coin Flip Düellosu
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
import {
  validateInvite,
  saveSession,
  getSession,
  updateSession,
  deleteSession,
  settleCoinFlip,
  settleSlotRace,
  settleBlackjackPro,
  calcHouseCutRate,
  buildDeck,
  dealInitialHands,
  hitCard,
  calcHandValue,
  type PvpGamblingSession,
  type PvpGamblingResult,
} from '../systems/PvPGamblingSystem';
import { formatNumber, formatDuration } from '../utils/format';
import type { CommandContext } from '../types';
import {
  PVP_GAMBLE_INVITE_TTL_MS,
  PVP_BJ_HIGH_STAKES_THRESHOLD,
  PVP_BJ_TURN_TTL_MS,
  PVP_CF_SERIAL_KILLER_STREAK,
  PVP_SLOT_ANIMATION_DELAY_MS,
  PVP_SLOT_SPIN_STEPS,
  SLOT_TABLE,
  COLOR_SUCCESS,
  COLOR_FAIL,
  COLOR_WARNING,
} from '../config';

// ─── Text Renderer'lar ────────────────────────────────────────────────────────

const SEP_PVP = '─────────────────────';

/** Davet embed'i */
function buildInviteEmbed(
  mode: PvpGamblingSession['mode'],
  challengerName: string,
  defenderName: string,
  bet: number,
  houseCutRate: number,
): EmbedBuilder {
  const modeLabel = { coinflip: '🪙 Coin Flip', slot: '🎰 Slot Yarışması', blackjack: '🃏 Blackjack' }[mode];
  const modeDesc  = {
    coinflip:  'Yazı mı tura mı? Hızlı ve acımasız.',
    slot:      'Makineler aynı anda dönsün, en iyi kombinasyon kazansın.',
    blackjack: '21\'e en yakın olan kazanır. Sıralı hamle, yüksek gerilim.',
  }[mode];
  const winnable = formatNumber(Math.floor(bet * 2 * (1 - houseCutRate)));

  return new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle(`⚔️ PvP Daveti — ${modeLabel}`)
    .setDescription(`**${challengerName}** seni meydan okumaya davet ediyor!\n> ${modeDesc}`)
    .addFields(
      { name: '💰 Bahis',        value: `**${formatNumber(bet)} coin**`, inline: true },
      { name: '🏦 Kasa Payı',    value: `%${(houseCutRate * 100).toFixed(0)}`,         inline: true },
      { name: '🏆 Kazanılabilir', value: `**${winnable} coin**`,                        inline: true },
    )
    .setFooter({ text: `${defenderName} — 30 saniye içinde yanıtla` })
    .setTimestamp();
}

/** Coin Flip sonuç — düz text */
function buildCoinFlipResultText(
  result: PvpGamblingResult,
  challengerName: string,
  defenderName: string,
): string {
  const winnerName = result.coinflip?.winner === 'challenger' ? challengerName : defenderName;
  const loserName  = result.coinflip?.winner === 'challenger' ? defenderName   : challengerName;

  let s = `### 🪙 Coin Flip — Sonuç\n`;
  s += `${SEP_PVP}\n`;
  s += `🏆 **${winnerName}** kazandı!  **+${formatNumber(result.winnerGain)} coin**\n`;
  s += `💸 **${loserName}** kaybetti.  **-${formatNumber(result.loserLoss)} coin**\n`;
  s += `${SEP_PVP}\n`;
  s += `💰 Bahis: ${formatNumber(result.bet)}  ·  🏦 Kasa: ${formatNumber(result.houseCut)} coin`;

  if (result.rebate) {
    s += `\n\n🦉 **Baykuş Tesellisi** — ${loserName} üst üste ${result.rebate.lossStreak} kez kaybetti → **+${formatNumber(result.rebate.amount)} coin** iade`;
  }
  return s;
}

/** Slot spin animasyon — düz text */
function buildSlotSpinText(
  challengerName: string,
  defenderName: string,
  challengerSymbols: string[],
  defenderSymbols: string[],
  spinning: boolean,
): string {
  const spin = '🔄 🔄 🔄';
  const cDisplay = spinning ? spin : challengerSymbols.join(' ');
  const dDisplay = spinning ? spin : defenderSymbols.join(' ');

  let s = `### 🎰 Slot Yarışması\n`;
  s += `${SEP_PVP}\n`;
  s += `🎮 **${challengerName}**\n\`${cDisplay}\`\n\n`;
  s += `🎮 **${defenderName}**\n\`${dDisplay}\`\n`;
  s += `${SEP_PVP}\n`;
  s += spinning ? `> 🔄 *Makineler dönüyor...*` : `> ✅ *Sonuçlar belli oldu!*`;
  return s;
}

/** Slot sonuç — düz text */
function buildSlotResultText(
  result: PvpGamblingResult,
  challengerName: string,
  defenderName: string,
  challengerId: string,
): string {
  const isPush = result.winnerId === null;
  const winnerName = isPush ? null : result.winnerId === challengerId ? challengerName : defenderName;
  const loserName  = isPush ? null : winnerName === challengerName ? defenderName : challengerName;

  const outcome = isPush
    ? `🤝 **Beraberlik!** Bahisler iade edildi.`
    : `🏆 **${winnerName}** kazandı!  **+${formatNumber(result.winnerGain)} coin**\n💸 **${loserName}** kaybetti.  **-${formatNumber(result.loserLoss)} coin**`;

  let s = `### 🎰 Slot Yarışması — Sonuç\n`;
  s += `${SEP_PVP}\n`;
  s += `${outcome}\n`;
  s += `${SEP_PVP}\n`;
  s += `🎮 **${challengerName}**\n\`${result.slot!.challengerSymbols.join(' ')}\`\n\n`;
  s += `🎮 **${defenderName}**\n\`${result.slot!.defenderSymbols.join(' ')}\`\n`;
  s += `${SEP_PVP}\n`;
  s += `💰 Bahis: ${formatNumber(result.bet)}`;
  if (!isPush) s += `  ·  🏦 Kasa: ${formatNumber(result.houseCut)} coin`;

  if (result.slot?.comboBonus) {
    s += `\n\n✨ **Combo Bonusu!** Her ikisi de aynı sembolü yakaladı → **+${result.slot.comboXP} XP**`;
  }
  if (result.rebate) {
    s += `\n\n🦉 **Baykuş Tesellisi** — Üst üste ${result.rebate.lossStreak} kayıp → **+${formatNumber(result.rebate.amount)} coin** iade`;
  }
  return s;
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

const SEP = '─────────────────────';

/** Blackjack el gösterimi — solo BJ tarzı inline backtick kartlar */
function formatHand(cards: { rank: string; suit: string }[], hideFirst = false): string {
  if (hideFirst && cards.length >= 2) {
    return [`\`🂠\``, ...cards.slice(1).map((c) => `\`${c.rank}${c.suit}\``)].join(' ');
  }
  return cards.map((c) => `\`${c.rank}${c.suit}\``).join(' ');
}

/** Oyun sırasında gösterilen düz text ekranı */
function buildBJScreen(
  session: PvpGamblingSession,
  challengerName: string,
  defenderName: string,
): string {
  const bj = session.bj!;
  const cHand = calcHandValue(bj.challengerHand);
  const dHand = calcHandValue(bj.defenderHand);
  const isHighStakes = session.bet >= PVP_BJ_HIGH_STAKES_THRESHOLD;
  const currentTurnName = bj.currentTurn === 'challenger' ? challengerName : defenderName;

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

  const cTag = bj.currentTurn === 'challenger' ? '  🟢 sıra sende' : bj.challengerStood ? '  🛑 stand' : '';
  const dTag = bj.currentTurn === 'defender'   ? '  🟢 sıra sende' : bj.defenderStood   ? '  🛑 stand' : '';

  const phaseTag = isHighStakes ? '⚠️ Yüksek Riskli' : `🟢 Senin turun`;

  let s = `### 🃏 Blackjack\n`;
  s += `${SEP}\n`;
  s += `**Bahis:** ${formatNumber(session.bet)} 💰  ·  ${phaseTag}\n`;
  s += `${SEP}\n\n`;
  s += `👤 **${challengerName}**  —  **${cTotalStr}**${cTag}\n`;
  s += `${formatHand(bj.challengerHand, hideCFromDefender)}\n\n`;
  s += `👤 **${defenderName}**  —  **${dTotalStr}**${dTag}\n`;
  s += `${formatHand(bj.defenderHand, hideDFromChallenger)}\n`;
  s += `\n${SEP}\n`;
  s += `> 🃏 *Hit mi Stand mı? (${Math.floor(PVP_BJ_TURN_TTL_MS / 1000)}s)*`;

  return s;
}

/** Blackjack Hit/Stand buton satırı */
function buildBJActionRow(sessionId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`bj_hit:${sessionId}`)
      .setEmoji('🃏')
      .setLabel('Hit')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`bj_stand:${sessionId}`)
      .setEmoji('🛑')
      .setLabel('Stand')
      .setStyle(ButtonStyle.Danger),
  );
}

/** Blackjack devre dışı buton satırı */
function buildBJDisabledRow(sessionId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`bj_hit:${sessionId}`)
      .setEmoji('🃏')
      .setLabel('Hit')
      .setStyle(ButtonStyle.Success)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`bj_stand:${sessionId}`)
      .setEmoji('🛑')
      .setLabel('Stand')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(true),
  );
}

/** Sonuç ekranı — düz text */
function buildBJResultScreen(
  result: PvpGamblingResult,
  challengerName: string,
  defenderName: string,
): string {
  const bj = result.blackjack!;

  const outcomeText = {
    challenger_wins: `🏆 **${challengerName}** kazandı!`,
    defender_wins:   `🏆 **${defenderName}** kazandı!`,
    push:            `🤝 Beraberlik — bahisler iade edildi`,
  }[bj.outcome];

  const cTotal = bj.challengerHand.isBust ? 'BUST 💀' : bj.challengerHand.isBlackjack ? '21 🎉' : String(bj.challengerHand.total);
  const dTotal = bj.defenderHand.isBust   ? 'BUST 💀' : bj.defenderHand.isBlackjack   ? '21 🎉' : String(bj.defenderHand.total);

  const netLine = bj.outcome === 'push'
    ? `🔘 İade: **${formatNumber(result.bet)} coin**`
    : `💰 **+${formatNumber(result.winnerGain)} coin**  ·  🏦 Kasa: ${formatNumber(result.houseCut)} coin`;

  let s = `### 🃏 Blackjack — Sonuç\n`;
  s += `${SEP}\n`;
  s += `${outcomeText}\n`;
  s += `${SEP}\n\n`;
  s += `👤 **${challengerName}**  —  **${cTotal}**\n`;
  s += `${formatHand(bj.challengerHand.cards)}\n\n`;
  s += `👤 **${defenderName}**  —  **${dTotal}**\n`;
  s += `${formatHand(bj.defenderHand.cards)}\n`;
  s += `\n${SEP}\n`;
  s += netLine;

  if (result.rebate) {
    s += `\n\n🦉 **Baykuş Tesellisi** — Üst üste ${result.rebate.lossStreak} kayıp → **+${formatNumber(result.rebate.amount)} coin** iade`;
  }

  return s;
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
    embeds: [buildInviteEmbed(mode, challengerName, defenderName, bet, houseCutRate)],
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
      await i.update({
        content: `⚔️ **Oyun Başlıyor!** — **${challengerName}** vs **${defenderName}** — Hazır olun!`,
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

/** Coin Flip oyun akışı */
async function runCoinFlipGame(
  message: Message,
  ctx: CommandContext,
  sessionId: string,
  challengerName: string,
  defenderName: string,
): Promise<void> {
  const session = await getSession(ctx.redis, sessionId);
  if (!session) throw new Error('Oturum bulunamadı.');

  const animMsg = await (message.channel as TextChannel).send({
    content: `### 🪙 Coin Flip\n${SEP_PVP}\n**${challengerName}** 🆚 **${defenderName}**\n> 🔄 *Coin havaya fırlatıldı...*\n${SEP_PVP}\n💰 Bahis: **${formatNumber(session.bet)} coin**`,
  });

  await new Promise((r) => setTimeout(r, 1500));
  const result = await settleCoinFlip(ctx.prisma, ctx.redis, session);

  await animMsg.edit({
    content: buildCoinFlipResultText(result, challengerName, defenderName),
  });

  if (result.serialKiller) {
    const killerName = result.coinflip?.winner === 'challenger' ? challengerName : defenderName;
    await (message.channel as TextChannel).send({
      content: `### 💀 SERİ KATİL!\n${SEP_PVP}\n**${killerName}** üst üste **${result.cfStreak}** Coin Flip kazandı!\n> 🔥 Bu oyuncu durdurulamıyor!`,
    });
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
    content: buildSlotSpinText(challengerName, defenderName, [], [], true),
  });

  for (let step = 0; step < PVP_SLOT_SPIN_STEPS; step++) {
    await new Promise((r) => setTimeout(r, PVP_SLOT_ANIMATION_DELAY_MS));
    const fakeC = [SLOT_TABLE[Math.floor(Math.random() * SLOT_TABLE.length)]!.name,
                   SLOT_TABLE[Math.floor(Math.random() * SLOT_TABLE.length)]!.name,
                   SLOT_TABLE[Math.floor(Math.random() * SLOT_TABLE.length)]!.name];
    const fakeD = [SLOT_TABLE[Math.floor(Math.random() * SLOT_TABLE.length)]!.name,
                   SLOT_TABLE[Math.floor(Math.random() * SLOT_TABLE.length)]!.name,
                   SLOT_TABLE[Math.floor(Math.random() * SLOT_TABLE.length)]!.name];
    await spinMsg.edit({
      content: buildSlotSpinText(challengerName, defenderName, fakeC, fakeD, step < PVP_SLOT_SPIN_STEPS - 1),
    });
  }

  const result = await settleSlotRace(ctx.prisma, ctx.redis, session);

  await spinMsg.edit({
    content: buildSlotResultText(result, challengerName, defenderName, session.challengerId),
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
      content: `### ⚠️ Yüksek Riskli Masa\n${SEP_PVP}\n**${challengerName}** vs **${defenderName}** — **${formatNumber(session.bet)} coin** bahisli Blackjack başladı!\n> 👁️ Bu masayı izleyebilirsiniz.`,
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
    content: buildBJScreen(updatedSession, challengerName, defenderName),
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
      await i.update({
        content: buildBJResultScreen(result, challengerName, defenderName),
        embeds: [],
        components: [buildBJDisabledRow(sessionId)],
      });
    } else {
      await i.update({
        content: buildBJScreen(newSession, challengerName, defenderName),
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
          const timeoutNote = `\n⏰ *${timedOutName} süre dolduğu için otomatik stand yaptı.*`;
          await gameMsg.edit({
            content: buildBJResultScreen(result, challengerName, defenderName) + timeoutNote,
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
 * Coin Flip — mention varsa PvP, yoksa solo (gambling.ts)
 */
export async function runPvpCoinFlip(
  message: Message,
  args: string[],
  ctx: CommandContext,
): Promise<void> {
  const target = resolveTarget(message, args);
  const betRaw = args.find((a) => /^\d+$/.test(a));

  // Solo mod — mention yok
  if (!target) {
    if (!betRaw) {
      await message.reply('❌ Kullanım: `owl cf <miktar>` veya `owl cf @oyuncu <miktar>`');
      return;
    }
    const bet = parseInt(betRaw, 10);
    const { coinFlip } = await import('../systems/gambling.js');
    try {
      const result = await coinFlip(ctx.prisma, message.author.id, bet);
      const frames = ['🪙', '🔄', '🪙', '🔄', '🪙'];
      const sent = await message.reply(`🪙 **${bet}** 💰 yatırdı...\nPara dönüyor...`);
      for (const frame of frames) {
        await new Promise((r) => setTimeout(r, 200));
        await sent.edit(`🪙 **${bet}** 💰 yatırdı... ${frame}`).catch(() => null);
      }
      await sent.edit(
        result.win
          ? `✅ **KAZANDIN!** +${result.deltaCoins} 💰 · Bakiye: **${result.finalCoins}** 💰`
          : `❌ **KAYBETTİN.** -${Math.abs(result.deltaCoins)} 💰 · Bakiye: **${result.finalCoins}** 💰`,
      ).catch(() => null);
    } catch (err) {
      await message.reply(`❌ ${err instanceof Error ? err.message : 'Hata'}`);
    }
    return;
  }

  // PvP mod
  if (!betRaw) {
    await message.reply('❌ Kullanım: `owl cf @oyuncu <miktar>`');
    return;
  }
  if (target.id === message.author.id) {
    await message.reply({ content: '❌ **Geçersiz Hedef** — Kendine meydan okuyamazsın.' });
    return;
  }
  const bet = parseInt(betRaw, 10);
  const authorName = message.member?.displayName ?? message.author.username;
  await runInviteFlow(message, ctx, message.author.id, authorName, target.id, target.name, bet, 'coinflip');
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
  const betRaw = args.find((a) => /^\d+$/.test(a));

  // Solo mod
  if (!target) {
    if (!betRaw) {
      await message.reply('❌ Kullanım: `owl slot <miktar>` veya `owl slot @oyuncu <miktar>`');
      return;
    }
    const bet = parseInt(betRaw, 10);
    const { slot } = await import('../systems/gambling.js');
    const SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '🍉', '💎', '⭐', '🔔'];
    const rand = () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]!;
    try {
      const result = await slot(ctx.prisma, message.author.id, bet);
      const sent = await message.reply(`**═══ SLOTS ═══**\n| ❓ | ❓ | ❓ |`);
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 250));
        await sent.edit(`**═══ SLOTS ═══**\n| ${rand()} | ${rand()} | ${rand()} |`).catch(() => null);
      }
      await sent.edit(
        `**═══ SLOTS ═══**\n| ${rand()} | ${rand()} | ${rand()} |\n\n` +
        (result.win
          ? `✅ **+${result.deltaCoins} 💰 kazandın!**`
          : `❌ **-${Math.abs(result.deltaCoins)} 💰 kaybettin.**`) +
        `\nBakiye: **${result.finalCoins}** 💰`,
      ).catch(() => null);
    } catch (err) {
      await message.reply(`❌ ${err instanceof Error ? err.message : 'Hata'}`);
    }
    return;
  }

  // PvP mod
  if (!betRaw) {
    await message.reply('❌ Kullanım: `owl slot @oyuncu <miktar>`');
    return;
  }
  if (target.id === message.author.id) {
    await message.reply({ content: '❌ **Geçersiz Hedef** — Kendine meydan okuyamazsın.' });
    return;
  }
  const bet = parseInt(betRaw, 10);
  const authorName = message.member?.displayName ?? message.author.username;
  await runInviteFlow(message, ctx, message.author.id, authorName, target.id, target.name, bet, 'slot');
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
  const betRaw = args.find((a) => /^\d+$/.test(a));

  // Solo mod — bj.ts'deki handler'a yönlendir
  if (!target) {
    if (!betRaw) {
      await message.reply('❌ Kullanım: `owl bj <miktar>` veya `owl bj @oyuncu <miktar>`');
      return;
    }
    const bet = parseInt(betRaw, 10);
    const { handleBjTextCommand } = await import('./bj.js');
    await handleBjTextCommand(message, bet, ctx);
    return;
  }

  // PvP mod
  if (!betRaw) {
    await message.reply('❌ Kullanım: `owl bj @oyuncu <miktar>`');
    return;
  }
  if (target.id === message.author.id) {
    await message.reply({ content: '❌ **Geçersiz Hedef** — Kendine meydan okuyamazsın.' });
    return;
  }
  const bet = parseInt(betRaw, 10);
  const authorName = message.member?.displayName ?? message.author.username;
  await runInviteFlow(message, ctx, message.author.id, authorName, target.id, target.name, bet, 'blackjack');
}

