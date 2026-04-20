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
import { failEmbed, warningEmbed, successEmbed, infoEmbed } from '../utils/embed';
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

// ─── Embed Yardımcıları ───────────────────────────────────────────────────────

/** Davet embed'i */
function buildInviteEmbed(
  mode: PvpGamblingSession['mode'],
  challengerName: string,
  defenderName: string,
  bet: number,
  houseCutRate: number,
): EmbedBuilder {
  const modeLabel = { coinflip: '🪙 Coin Flip Düellosu', slot: '🎰 Slot Yarışması', blackjack: '🃏 Blackjack Pro' }[mode];
  const modeDesc = {
    coinflip: 'Yazı mı tura mı? Hızlı ve acımasız.',
    slot: 'Makineler aynı anda dönsün, en iyi kombinasyon kazansın.',
    blackjack: '21\'e en yakın olan kazanır. Sıralı hamle, yüksek gerilim.',
  }[mode];

  return new EmbedBuilder()
    .setColor(0xf59e0b)
    .setTitle(`⚔️ PvP Daveti — ${modeLabel}`)
    .setDescription(
      `**${challengerName}** seni **${modeLabel}** için meydan okumaya davet ediyor!\n\n` +
      `> ${modeDesc}`,
    )
    .addFields(
      { name: '💰 Bahis', value: `**${formatNumber(bet)} coin**`, inline: true },
      { name: '🏦 Kasa Payı', value: `%${(houseCutRate * 100).toFixed(0)}`, inline: true },
      { name: '🏆 Kazanılabilir', value: `**${formatNumber(Math.floor(bet * 2 * (1 - houseCutRate)))} coin**`, inline: true },
    )
    .setFooter({ text: `${defenderName} — 30 saniye içinde yanıtla` })
    .setTimestamp();
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

/** Devre dışı bırakılmış buton satırı (oyun bitti/zaman aşımı) */
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

// ─── Sonuç Embed'leri ─────────────────────────────────────────────────────────

/** Coin Flip sonuç embed'i */
function buildCoinFlipResultEmbed(
  result: PvpGamblingResult,
  challengerName: string,
  defenderName: string,
): EmbedBuilder {
  const winnerName = result.winnerId === result.coinflip?.winner ? challengerName : defenderName;
  // Gerçek kazanan adını belirle
  const actualWinnerName = result.winnerId
    ? (result.winnerId === result.coinflip?.winner
        ? challengerName  // Bu mantık aşağıda düzeltildi
        : defenderName)
    : challengerName;

  // Kazanan ID'ye göre isim
  const winnerDisplayName = result.winnerId
    ? (result.coinflip?.winner === 'challenger' ? challengerName : defenderName)
    : '?';
  const loserDisplayName = result.coinflip?.winner === 'challenger' ? defenderName : challengerName;

  const embed = new EmbedBuilder()
    .setColor(result.winnerId ? 0x22c55e : 0xef4444)
    .setTitle('🪙 Coin Flip Sonucu')
    .setDescription(
      `**${winnerDisplayName}** yazıyı/turayı doğru tahmin etti!\n\n` +
      `🏆 **Kazanan:** ${winnerDisplayName} **+${formatNumber(result.winnerGain)} coin**\n` +
      `💸 **Kaybeden:** ${loserDisplayName} **-${formatNumber(result.loserLoss)} coin**`,
    )
    .addFields(
      { name: '💰 Bahis', value: formatNumber(result.bet), inline: true },
      { name: '🏦 Kasa Payı', value: `${formatNumber(result.houseCut)} coin (%${(result.houseCutRate * 100).toFixed(0)})`, inline: true },
    )
    .setTimestamp();

  if (result.rebate) {
    embed.addFields({
      name: '🦉 Baykuş Tesellisi',
      value: `**${loserDisplayName}** üst üste ${result.rebate.lossStreak} kez kaybetti. **+${formatNumber(result.rebate.amount)} coin** iade edildi!\n*Moralini bozma, tekrar dene!*`,
    });
  }

  return embed;
}

/** Slot Race animasyon embed'i (spin sırasında) */
function buildSlotSpinEmbed(
  challengerName: string,
  defenderName: string,
  challengerSymbols: string[],
  defenderSymbols: string[],
  spinning: boolean,
): EmbedBuilder {
  const spinChar = '🔄';
  const cDisplay = spinning
    ? `${spinChar} ${spinChar} ${spinChar}`
    : challengerSymbols.join(' ');
  const dDisplay = spinning
    ? `${spinChar} ${spinChar} ${spinChar}`
    : defenderSymbols.join(' ');

  return new EmbedBuilder()
    .setColor(0x8b5cf6)
    .setTitle('🎰 Slot Yarışması')
    .addFields(
      { name: `🎮 ${challengerName}`, value: `\`${cDisplay}\``, inline: true },
      { name: '\u200b', value: '**VS**', inline: true },
      { name: `🎮 ${defenderName}`, value: `\`${dDisplay}\``, inline: true },
    )
    .setFooter({ text: spinning ? 'Makineler dönüyor...' : 'Sonuçlar belli oldu!' });
}

/** Slot Race sonuç embed'i */
function buildSlotResultEmbed(
  result: PvpGamblingResult,
  challengerName: string,
  defenderName: string,
): EmbedBuilder {
  const winnerName = result.winnerId === result.slot?.challengerSymbols ? challengerName : defenderName;
  const isChallWin = result.coinflip?.winner === 'challenger' ||
    (result.slot && result.winnerId !== null);

  // Kazanan/kaybeden isimlerini belirle
  const winName = result.winnerId ? (result.winnerId.endsWith('c') ? challengerName : defenderName) : challengerName;
  const loseName = result.loserId ? (result.loserId.endsWith('c') ? challengerName : defenderName) : defenderName;

  const embed = new EmbedBuilder()
    .setColor(0x8b5cf6)
    .setTitle('🎰 Slot Yarışması Sonucu')
    .addFields(
      {
        name: `🎮 ${challengerName}`,
        value: `\`${result.slot!.challengerSymbols.join(' ')}\``,
        inline: true,
      },
      { name: '\u200b', value: '**VS**', inline: true },
      {
        name: `🎮 ${defenderName}`,
        value: `\`${result.slot!.defenderSymbols.join(' ')}\``,
        inline: true,
      },
    )
    .addFields(
      { name: '💰 Bahis', value: formatNumber(result.bet), inline: true },
      { name: '🏦 Kasa Payı', value: `${formatNumber(result.houseCut)} coin`, inline: true },
    )
    .setTimestamp();

  if (result.slot?.comboBonus) {
    embed.addFields({
      name: '✨ Combo Bonusu!',
      value: `Her iki oyuncu da aynı sembolü yakaladı! Her ikisine **+${result.slot.comboXP} Baykuş Tecrübe Puanı** verildi.`,
    });
  }

  if (result.rebate) {
    embed.addFields({
      name: '🦉 Baykuş Tesellisi',
      value: `Üst üste ${result.rebate.lossStreak} kayıp. **+${formatNumber(result.rebate.amount)} coin** iade edildi!`,
    });
  }

  return embed;
}

// ─── Blackjack Embed'leri ─────────────────────────────────────────────────────

/** Blackjack el gösterimi */
function formatHand(cards: { rank: string; suit: string }[], hideSecond = false): string {
  if (hideSecond && cards.length >= 2) {
    return `${cards[0]!.rank}${cards[0]!.suit} 🂠`;
  }
  return cards.map((c) => `${c.rank}${c.suit}`).join(' ');
}

/** Blackjack oyun durumu embed'i */
function buildBJGameEmbed(
  session: PvpGamblingSession,
  challengerName: string,
  defenderName: string,
  revealAll = false,
): EmbedBuilder {
  const bj = session.bj!;
  const cHand = calcHandValue(bj.challengerHand);
  const dHand = calcHandValue(bj.defenderHand);

  const isHighStakes = session.bet >= PVP_BJ_HIGH_STAKES_THRESHOLD;
  const title = isHighStakes
    ? '🃏 Blackjack Pro — ⚠️ YÜKSEK RİSKLİ MASA'
    : '🃏 Blackjack Pro';

  const currentTurnName =
    bj.currentTurn === 'challenger' ? challengerName : defenderName;

  const embed = new EmbedBuilder()
    .setColor(isHighStakes ? 0xef4444 : 0x1d4ed8)
    .setTitle(title)
    .addFields(
      {
        name: `🎮 ${challengerName}`,
        value: `Kart: \`${formatHand(bj.challengerHand, !revealAll && bj.currentTurn === 'defender')}\`\nToplam: **${revealAll || bj.currentTurn === 'challenger' ? cHand.total : '?'}**${cHand.isBust ? ' 💥 BUST' : ''}${cHand.isBlackjack ? ' 🎉 BLACKJACK' : ''}`,
        inline: true,
      },
      { name: '\u200b', value: '**VS**', inline: true },
      {
        name: `🎮 ${defenderName}`,
        value: `Kart: \`${formatHand(bj.defenderHand, !revealAll && bj.currentTurn === 'challenger')}\`\nToplam: **${revealAll || bj.currentTurn === 'defender' ? dHand.total : '?'}**${dHand.isBust ? ' 💥 BUST' : ''}${dHand.isBlackjack ? ' 🎉 BLACKJACK' : ''}`,
        inline: true,
      },
    )
    .addFields(
      { name: '💰 Bahis', value: formatNumber(session.bet), inline: true },
      { name: '🎯 Sıra', value: revealAll ? '—' : `**${currentTurnName}**`, inline: true },
    );

  if (isHighStakes) {
    embed.setDescription('> ⚠️ Bu masa **yüksek riskli** olarak işaretlendi. Diğer oyuncular izleyebilir.');
  }

  return embed;
}

/** Blackjack Hit/Stand buton satırı */
function buildBJActionRow(sessionId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`bj_hit:${sessionId}`)
      .setLabel('🃏 Hit')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`bj_stand:${sessionId}`)
      .setLabel('✋ Stand')
      .setStyle(ButtonStyle.Secondary),
  );
}

/** Blackjack devre dışı buton satırı */
function buildBJDisabledRow(sessionId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`bj_hit:${sessionId}`)
      .setLabel('🃏 Hit')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`bj_stand:${sessionId}`)
      .setLabel('✋ Stand')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
  );
}

/** Blackjack sonuç embed'i */
function buildBJResultEmbed(
  result: PvpGamblingResult,
  challengerName: string,
  defenderName: string,
): EmbedBuilder {
  const bj = result.blackjack!;
  const outcomeText = {
    challenger_wins: `🏆 **${challengerName}** kazandı!`,
    defender_wins: `🏆 **${defenderName}** kazandı!`,
    push: '🤝 **Beraberlik!** Bahisler iade edildi.',
  }[bj.outcome];

  const embed = new EmbedBuilder()
    .setColor(bj.outcome === 'push' ? 0xf59e0b : 0x22c55e)
    .setTitle('🃏 Blackjack Pro — Sonuç')
    .setDescription(outcomeText)
    .addFields(
      {
        name: `🎮 ${challengerName}`,
        value: `\`${formatHand(bj.challengerHand.cards)}\`\nToplam: **${bj.challengerHand.total}**${bj.challengerHand.isBust ? ' 💥' : ''}${bj.challengerHand.isBlackjack ? ' 🎉' : ''}`,
        inline: true,
      },
      { name: '\u200b', value: '**VS**', inline: true },
      {
        name: `🎮 ${defenderName}`,
        value: `\`${formatHand(bj.defenderHand.cards)}\`\nToplam: **${bj.defenderHand.total}**${bj.defenderHand.isBust ? ' 💥' : ''}${bj.defenderHand.isBlackjack ? ' 🎉' : ''}`,
        inline: true,
      },
    )
    .addFields(
      { name: '💰 Bahis', value: formatNumber(result.bet), inline: true },
      { name: '🏦 Kasa Payı', value: `${formatNumber(result.houseCut)} coin`, inline: true },
      {
        name: bj.outcome === 'push' ? '↩️ İade' : '💸 Net Kazanç',
        value: bj.outcome === 'push'
          ? `Her iki oyuncuya **${formatNumber(result.bet)} coin** iade`
          : `**+${formatNumber(result.winnerGain)} coin**`,
        inline: true,
      },
    )
    .setTimestamp();

  if (result.rebate) {
    embed.addFields({
      name: '🦉 Baykuş Tesellisi',
      value: `Üst üste ${result.rebate.lossStreak} kayıp. **+${formatNumber(result.rebate.amount)} coin** iade edildi!\n*Moralini bozma, tekrar dene!*`,
    });
  }

  return embed;
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
      embeds: [failEmbed('❌ Oyun Başlatılamadı', validation.error ?? 'Bilinmeyen hata.')],
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
  const inviteMsg = await message.channel.send({
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

  collector.on('collect', async (i) => {
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
        embeds: [warningEmbed('🚫 Davet Reddedildi', `**${defenderName}** daveti reddetti.`)],
        components: [buildDisabledRow(sessionId)],
      });
      return;
    }

    if (action === 'pvp_cancel') {
      await deleteSession(ctx.redis, sessionId);
      await i.update({
        embeds: [warningEmbed('🚫 Davet İptal Edildi', `**${challengerName}** daveti iptal etti.`)],
        components: [buildDisabledRow(sessionId)],
      });
      return;
    }

    if (action === 'pvp_accept') {
      await i.update({
        embeds: [infoEmbed('⚔️ Oyun Başlıyor!', `**${challengerName}** vs **${defenderName}** — Hazır olun!`)],
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
        await message.channel.send({
          embeds: [failEmbed('❌ Oyun Hatası', err instanceof Error ? err.message : 'Beklenmeyen hata.')],
        });
      }
    }
  });

  collector.on('end', async (_, reason) => {
    if (reason === 'time') {
      await deleteSession(ctx.redis, sessionId);
      await inviteMsg.edit({
        embeds: [warningEmbed('⏰ Zaman Aşımı', `**${defenderName}** 30 saniye içinde yanıt vermedi. Davet iptal edildi.`)],
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

  // Animasyonlu embed — "yazı mı tura mı" gerilimi
  const animMsg = await message.channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(0xf59e0b)
        .setTitle('🪙 Coin Flip Düellosu')
        .setDescription(
          `**${challengerName}** 🆚 **${defenderName}**\n\n` +
          `> 🔄 Coin havaya fırlatıldı...\n\n` +
          `💰 Bahis: **${formatNumber(session.bet)} coin**`,
        ),
    ],
  });

  // Kısa bekleme (gerilim efekti)
  await new Promise((r) => setTimeout(r, 1500));

  // Sonucu hesapla
  const result = await settleCoinFlip(ctx.prisma, ctx.redis, session);

  // Sonuç embed'ini güncelle
  await animMsg.edit({
    embeds: [buildCoinFlipResultEmbed(result, challengerName, defenderName)],
  });

  // Seri Katil duyurusu
  if (result.serialKiller) {
    const killerName = result.coinflip?.winner === 'challenger' ? challengerName : defenderName;
    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xdc2626)
          .setTitle('💀 SERİ KATİL!')
          .setDescription(
            `**${killerName}** üst üste **${result.cfStreak}** Coin Flip kazandı!\n\n` +
            `> 🔥 Bu oyuncu durdurulamıyor! Kim karşısına çıkacak?`,
          ),
      ],
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

  // Animasyon: spin adımları
  const spinMsg = await message.channel.send({
    embeds: [buildSlotSpinEmbed(challengerName, defenderName, [], [], true)],
  });

  // Spin animasyonu (PVP_SLOT_SPIN_STEPS adım)
  for (let step = 0; step < PVP_SLOT_SPIN_STEPS; step++) {
    await new Promise((r) => setTimeout(r, PVP_SLOT_ANIMATION_DELAY_MS));
    // Her adımda rastgele semboller göster (sahte animasyon)
    const fakeC = [SLOT_TABLE[Math.floor(Math.random() * SLOT_TABLE.length)]!.name,
                   SLOT_TABLE[Math.floor(Math.random() * SLOT_TABLE.length)]!.name,
                   SLOT_TABLE[Math.floor(Math.random() * SLOT_TABLE.length)]!.name];
    const fakeD = [SLOT_TABLE[Math.floor(Math.random() * SLOT_TABLE.length)]!.name,
                   SLOT_TABLE[Math.floor(Math.random() * SLOT_TABLE.length)]!.name,
                   SLOT_TABLE[Math.floor(Math.random() * SLOT_TABLE.length)]!.name];
    await spinMsg.edit({
      embeds: [buildSlotSpinEmbed(challengerName, defenderName, fakeC, fakeD, step < PVP_SLOT_SPIN_STEPS - 1)],
    });
  }

  // Gerçek sonucu hesapla
  const result = await settleSlotRace(ctx.prisma, ctx.redis, session);

  // Final sonuç
  await spinMsg.edit({
    embeds: [buildSlotResultEmbed(result, challengerName, defenderName)],
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

  // Yüksek riskli masa uyarısı
  if (session.bet >= PVP_BJ_HIGH_STAKES_THRESHOLD) {
    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0xef4444)
          .setTitle('⚠️ YÜKSEK RİSKLİ MASA')
          .setDescription(
            `**${challengerName}** vs **${defenderName}** arasında **${formatNumber(session.bet)} coin** bahisli bir Blackjack Pro oyunu başladı!\n\n` +
            `> 👁️ Bu masayı izleyebilirsiniz. Etkileşim yapamazsınız.`,
          ),
      ],
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

  // Oyun embed'ini gönder
  const gameMsg = await message.channel.send({
    embeds: [buildBJGameEmbed(updatedSession, challengerName, defenderName)],
    components: [buildBJActionRow(sessionId)],
  });

  // Sıralı hamle collector'ı
  const collector = gameMsg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: PVP_BJ_TURN_TTL_MS * 2, // Her iki oyuncu için toplam süre
    filter: (i) =>
      (i.customId.startsWith('bj_hit:') || i.customId.startsWith('bj_stand:')) &&
      (i.user.id === session.challengerId || i.user.id === session.defenderId),
  });

  collector.on('collect', async (i) => {
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

    // Sıra kontrolü
    if (!isCurrentTurn) {
      await i.reply({ content: '⏳ Şu an sıra sende değil.', flags: 64 });
      return;
    }

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
      // Sonucu hesapla
      const result = await settleBlackjackPro(ctx.prisma, ctx.redis, newSession);
      await i.update({
        embeds: [buildBJResultEmbed(result, challengerName, defenderName)],
        components: [buildBJDisabledRow(sessionId)],
      });
    } else {
      await i.update({
        embeds: [buildBJGameEmbed(newSession, challengerName, defenderName)],
        components: [buildBJActionRow(sessionId)],
      });
    }
  });

  collector.on('end', async (_, reason) => {
    if (reason === 'time') {
      // Zaman aşımı: mevcut durumla sonuçlandır
      const current = await getSession(ctx.redis, sessionId);
      if (current?.bj) {
        // Stand yapmayan oyuncuyu otomatik stand yap
        const bjData = { ...current.bj, challengerStood: true, defenderStood: true };
        const finalSession = await updateSession(ctx.redis, sessionId, { bj: bjData });
        if (finalSession) {
          const result = await settleBlackjackPro(ctx.prisma, ctx.redis, finalSession);
          await gameMsg.edit({
            embeds: [buildBJResultEmbed(result, challengerName, defenderName)],
            components: [buildBJDisabledRow(sessionId)],
          });
        }
      }
    }
  });
}

// ─── Prefix Komut Giriş Noktaları ────────────────────────────────────────────

/**
 * Coin Flip Düellosu — `owl cf @oyuncu <miktar>`
 */
export async function runPvpCoinFlip(
  message: Message,
  args: string[],
  ctx: CommandContext,
): Promise<void> {
  const target = message.mentions.users.first();
  const betRaw = args.find((a) => /^\d+$/.test(a));

  if (!target || !betRaw) {
    await message.reply({
      embeds: [
        infoEmbed(
          '🪙 Coin Flip Düellosu',
          '**Kullanım:** `owl cf @oyuncu <miktar>`\n\n' +
          '> Rakibinle yazı-tura oyna. %50/%50 şans, hızlı sonuç.',
        ),
      ],
    });
    return;
  }

  if (target.bot || target.id === message.author.id) {
    await message.reply({ embeds: [failEmbed('❌ Geçersiz Hedef', 'Bota veya kendine meydan okuyamazsın.')] });
    return;
  }

  const bet = parseInt(betRaw, 10);
  await runInviteFlow(
    message, ctx,
    message.author.id, message.author.displayName ?? message.author.username,
    target.id, target.displayName ?? target.username,
    bet, 'coinflip',
  );
}

/**
 * Slot Yarışması — `owl slot @oyuncu <miktar>`
 */
export async function runPvpSlot(
  message: Message,
  args: string[],
  ctx: CommandContext,
): Promise<void> {
  const target = message.mentions.users.first();
  const betRaw = args.find((a) => /^\d+$/.test(a));

  if (!target || !betRaw) {
    await message.reply({
      embeds: [
        infoEmbed(
          '🎰 Slot Yarışması',
          '**Kullanım:** `owl slot @oyuncu <miktar>`\n\n' +
          '> İki makine aynı anda döner. En iyi kombinasyon kazanır.\n' +
          '> Her iki oyuncu da aynı sembolü yakalarsa **Combo XP Bonusu** kazanırsınız!',
        ),
      ],
    });
    return;
  }

  if (target.bot || target.id === message.author.id) {
    await message.reply({ embeds: [failEmbed('❌ Geçersiz Hedef', 'Bota veya kendine meydan okuyamazsın.')] });
    return;
  }

  const bet = parseInt(betRaw, 10);
  await runInviteFlow(
    message, ctx,
    message.author.id, message.author.displayName ?? message.author.username,
    target.id, target.displayName ?? target.username,
    bet, 'slot',
  );
}

/**
 * Blackjack Pro — `owl bj @oyuncu <miktar>`
 */
export async function runPvpBlackjack(
  message: Message,
  args: string[],
  ctx: CommandContext,
): Promise<void> {
  const target = message.mentions.users.first();
  const betRaw = args.find((a) => /^\d+$/.test(a));

  if (!target || !betRaw) {
    await message.reply({
      embeds: [
        infoEmbed(
          '🃏 Blackjack Pro',
          '**Kullanım:** `owl bj @oyuncu <miktar>`\n\n' +
          '> 21\'e en yakın olan kazanır. Sıralı hamle, Hit veya Stand.\n' +
          `> **${formatNumber(PVP_BJ_HIGH_STAKES_THRESHOLD)} coin** üzeri bahislerde **Yüksek Riskli Masa** uyarısı aktif olur.`,
        ),
      ],
    });
    return;
  }

  if (target.bot || target.id === message.author.id) {
    await message.reply({ embeds: [failEmbed('❌ Geçersiz Hedef', 'Bota veya kendine meydan okuyamazsın.')] });
    return;
  }

  const bet = parseInt(betRaw, 10);
  await runInviteFlow(
    message, ctx,
    message.author.id, message.author.displayName ?? message.author.username,
    target.id, target.displayName ?? target.username,
    bet, 'blackjack',
  );
}
