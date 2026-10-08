/**
 * owl-pvp.ts — /owl vs ve /owl duel komutları
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  type Message,
} from 'discord.js';
import { SIM_PVP_COOLDOWN_MS, PVP_DUEL_INVITE_TTL_MS } from '../config';
import { checkKeysPipelined } from '../middleware/cooldown';
import { armCooldown, peekCooldown } from '../middleware/cooldown-manager';
import { simulatePvP, startPvP, closePvpSessionIfPending } from '../systems/pvp';
import { runSimulatedPvP } from '../systems/pvp-sim';
import { acquirePvpActiveLock } from '../utils/lock';
import { resolveFlowRejectMessage } from '../utils/flow-helpers';
import {
  animatePvPInteraction,
  animatePvPMessage,
  animateSimPvPInteraction,
  animateSimPvPMessage,
  loadPvpDuelOwlProfiles,
} from '../utils/pvp-ux';
import type { PvpBattleData } from '../utils/pvp-ux';
import { failEmbed } from '../utils/embed';
import type { CommandDefinition } from '../types';
import { buildCooldownMessage } from '../utils/command-error';
import { interactionReplyWithSuppression, replyWithSuppression, SuppressionKeys } from '../utils/guarded-discord';
import { resolveDiscordDisplayName } from '../utils/player-display-name';
import { getOwlPrimaryName } from '../utils/owl-display';
import { safeReply } from '../utils/safe-reply';

const MAIN_OWL_NAME_SELECT = { species: true, nickname: true, hp: true, hpMax: true } as const;
const MAIN_OWL_DUEL_SELECT = {
  id: true,
  species: true,
  nickname: true,
  hp: true,
  hpMax: true,
  effectiveness: true,
  staminaCur: true,
  tier: true,
  statGaga: true,
  statPence: true,
  statGoz: true,
  statKulak: true,
  statKanat: true,
} as const;

/** Tek okuma. Eski refreshMainOwlVitalsIfNeeded ile aynı tamir: HP dolu, effectiveness 100. */
async function loadMainOwlForDuel(
  prisma: Parameters<CommandDefinition['execute']>[1]['prisma'],
  userId: string,
) {
  const owl = await prisma.owl.findFirst({
    where: { ownerId: userId, isMain: true },
    select: MAIN_OWL_DUEL_SELECT,
  });
  if (!owl) return null;
  if (owl.hp >= owl.hpMax && owl.effectiveness >= 100) return owl;
  await prisma.owl.update({
    where: { id: owl.id },
    data: {
      hp: owl.hpMax,
      ...(owl.effectiveness < 100 ? { effectiveness: 100 } : {}),
    },
  });
  return { ...owl, hp: owl.hpMax, effectiveness: owl.effectiveness < 100 ? 100 : owl.effectiveness };
}

async function getMainOwlBattleName(
  prisma: Parameters<CommandDefinition['execute']>[1]['prisma'],
  userId: string,
  fallback: string,
): Promise<string> {
  const owl = await prisma.owl.findFirst({
    where: { ownerId: userId, isMain: true },
    select: MAIN_OWL_NAME_SELECT,
  });
  return owl ? getOwlPrimaryName(owl, fallback) : fallback;
}

// ─── Slash: /owl vs ───────────────────────────────────────────────────────────

export async function runVs(
  interaction: Parameters<CommandDefinition['execute']>[0],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  const defender = interaction.options.getUser('kullanici', true);
  if (defender.id === interaction.user.id) {
    await interactionReplyWithSuppression(
      interaction,
      { content: `❌ Kendinle PvP yapamazsın.`, flags: 64 },
      SuppressionKeys.pvp('self-target'),
    );
    return;
  }

  const challengerName = interaction.member && 'displayName' in interaction.member
    ? (interaction.member as { displayName: string }).displayName
    : interaction.user.username;

  const pvpLockKey = `pvp:active:${interaction.user.id}`;

  const [challengerEntry, defenderEntry] = await checkKeysPipelined(ctx.redis, [pvpLockKey, `pvp:active:${defender.id}`]);
  const challengerActive = challengerEntry?.value ?? null;
  if (challengerActive) {
    await interactionReplyWithSuppression(
      interaction,
      { content: `⚔️ Zaten aktif bir PvP'n var.`, flags: 64 },
      SuppressionKeys.pvp('already-active'),
    );
    return;
  }

  // Defender'ın lock'unu kontrol et ama ALMA — sadece kabul ettiğinde alınacak
  const defenderLockKey = `pvp:active:${defender.id}`;
  const defenderActive  = defenderEntry?.value ?? null;
  if (defenderActive) {
    await interactionReplyWithSuppression(
      interaction,
      { content: `⚔️ Rakip şu an başka bir PvP'de.`, flags: 64 },
      SuppressionKeys.pvp('defender-busy'),
    );
    return;
  }

  // Sadece challenger'ın lock'unu al (atomik NX)
  const acquired = await acquirePvpActiveLock(ctx.redis, interaction.user.id, 60);
  if (!acquired) {
    await interactionReplyWithSuppression(
      interaction,
      { content: `⚔️ Zaten aktif bir PvP'n var.`, flags: 64 },
      SuppressionKeys.pvp('already-active'),
    );
    return;
  }

  const sessionId = await startPvP(ctx.prisma, interaction.user.id, defender.id);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`pvp_accept:${sessionId}`).setLabel('✅ Kabul').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`pvp_reject:${sessionId}`).setLabel('❌ Reddet').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`pvp_cancel:${sessionId}`).setLabel('🚫 İptal').setStyle(ButtonStyle.Secondary),
  );

  await interaction.reply({
    content: `⚔️ <@${defender.id}> duelloya davetlisin! 🦉\n> **${challengerName}** seni bekliyor...`,
    components: [row],
  });

  const msg = await interaction.fetchReply();
  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: PVP_DUEL_INVITE_TTL_MS,
  });

  collector.on('collect', async (i) => {
    if (i.customId.startsWith('pvp_cancel')) {
      if (i.user.id !== interaction.user.id) {
        await i.reply({ content: '❌ Bu butonu sadece daveti atan kullanabilir.', flags: 64 });
        return;
      }
      await ctx.prisma.pvpSession.update({ where: { id: sessionId }, data: { status: 'finished' } });
      await ctx.redis.del(pvpLockKey);  // Sadece challenger lock'unu temizle
      await i.update({ content: `🚫 Duel iptal edildi.`, components: [] });
      collector.stop();
      return;
    }

    if (i.user.id !== defender.id) {
      await i.reply({ content: '❌ Bu buton sana ait değil.', flags: 64 });
      return;
    }
    if (i.customId.startsWith('pvp_reject')) {
      await ctx.prisma.pvpSession.update({ where: { id: sessionId }, data: { status: 'finished' } });
      await i.update({ content: `🚫 **${defender.username}** meydan okumayı reddetti.`, components: [] });
      await ctx.redis.del(pvpLockKey);  // Sadece challenger lock'unu temizle
      collector.stop();
      return;
    }

    // Kabul edildi — defender lock (NX)
    const defenderAcquired = await acquirePvpActiveLock(ctx.redis, defender.id, 120);
    if (!defenderAcquired) {
      await closePvpSessionIfPending(ctx.prisma, sessionId);
      await i.update({ content: `⚔️ Rakip şu an başka bir PvP'de.`, components: [] });
      await ctx.redis.del(pvpLockKey);
      collector.stop();
      return;
    }

    await i.update({ content: `⚔️ **Savaş başlıyor...**`, components: [] });

    try {
      const result = await simulatePvP(ctx.prisma, sessionId, ctx.redis, interaction.guildId);
      const challengerNameFallback = interaction.member && 'displayName' in interaction.member
        ? (interaction.member as { displayName: string }).displayName
        : interaction.user.username;
      const defenderNameFallback = defender.displayName ?? defender.username;
      const [challengerBattleName, defenderBattleName] = await Promise.all([
        getMainOwlBattleName(ctx.prisma, interaction.user.id, challengerNameFallback),
        getMainOwlBattleName(ctx.prisma, defender.id, defenderNameFallback),
      ]);

      const battleData: PvpBattleData = {
        challengerId:    interaction.user.id,
        challengerName:  challengerBattleName,
        challengerHpMax: result.challengerHpMax,
        defenderId:      defender.id,
        defenderName:    defenderBattleName,
        defenderHpMax:   result.defenderHpMax,
        events:          result.events,
        winnerId:        result.winnerId,
        loserId:         result.loserId,
        totalTurns:      result.turns,
        winnerXP:        result.winnerXP,
        loserXP:         15,
        streak:          result.streak,
        xpByPlayerId:    result.xpByPlayerId,
      };
      const profiles = await loadPvpDuelOwlProfiles(
        ctx.prisma,
        interaction.user.id,
        defender.id,
        challengerBattleName,
        defenderBattleName,
      );
      battleData.challengerOwl = profiles.challenger;
      battleData.defenderOwl = profiles.defender;

      animatePvPInteraction(interaction, battleData).catch(() => {});
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Bir hata oluştu.';
      await interaction.editReply({ content: `❌ ${errMsg}` }).catch(() => null);
    } finally {
      await closePvpSessionIfPending(ctx.prisma, sessionId);
      await ctx.redis.del(pvpLockKey, defenderLockKey);  // Savaş bitti, her ikisini temizle
    }
    collector.stop();
  });

  collector.on('end', async (_, reason) => {
    if (reason === 'time') {
      await closePvpSessionIfPending(ctx.prisma, sessionId);
      await ctx.redis.del(pvpLockKey);  // Timeout: sadece challenger lock'unu temizle
      await interaction.editReply({ content: `⏰ Davet süresi doldu.`, components: [] }).catch(() => null);
    }
  });
}

// ─── Slash: /owl duel ─────────────────────────────────────────────────────────

export async function runDuel(
  interaction: Parameters<CommandDefinition['execute']>[0],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  const userId = interaction.user.id;
  const cooldownKey = `cooldown:duel:${userId}`;
  const [mainOwl, cooldown] = await Promise.all([
    loadMainOwlForDuel(ctx.prisma, userId),
    peekCooldown(ctx.redis, cooldownKey),
  ]);
  if (!mainOwl) {
    await interaction.reply({ embeds: [failEmbed('Hata', 'Main baykuş bulunamadı.')], flags: 64 });
    return;
  }

  if (cooldown.active) {
    const displayName = interaction.member && 'displayName' in interaction.member
      ? (interaction.member as { displayName: string }).displayName
      : interaction.user.username;
    const base = buildCooldownMessage(cooldown.remainingMs, 'duel', displayName);
    const msg = await resolveFlowRejectMessage(ctx.redis, userId, 'duel', 'cooldown', base);
    await interactionReplyWithSuppression(
      interaction,
      { content: msg, flags: 64 },
      SuppressionKeys.cooldown(cooldownKey),
    );
    return;
  }

  await interaction.deferReply({ flags: 64 });

  const result = await runSimulatedPvP(ctx.prisma, userId, ctx.redis, mainOwl);
  await armCooldown(ctx.redis, cooldownKey, SIM_PVP_COOLDOWN_MS);

  void animateSimPvPInteraction(
    interaction,
    userId,
    mainOwl,
    mainOwl.hpMax,
    result,
    resolveDiscordDisplayName(
      interaction.member && 'displayName' in interaction.member
        ? (interaction.member as { displayName: string })
        : null,
      interaction.user,
    ),
  ).catch((err) => {
    console.error('[Duel] Animasyon hatasi:', err instanceof Error ? err.message : err);
  });
}

// ─── Prefix: owl vs ───────────────────────────────────────────────────────────

export async function runVsMessage(
  message: Message,
  args: string[],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  const targetRaw  = args[0];
  const mentionId  = targetRaw?.match(/^<@!?(\d+)>$/)?.[1];
  const defenderId = mentionId ?? targetRaw;

  if (!defenderId) {
    await replyWithSuppression(
      message,
      `❌ **Kullanım:** owl vs @oyuncu`,
      SuppressionKeys.usage('vs'),
    );
    return;
  }
  if (defenderId === message.author.id) {
    await replyWithSuppression(
      message,
      `❌ **Hata** | Kendinle PvP yapamazsin.`,
      SuppressionKeys.pvp('self-target'),
    );
    return;
  }

  const pvpLockKey = `pvp:active:${message.author.id}`;

  const [alreadyActive, defenderActive] = await Promise.all([
    ctx.redis.get(pvpLockKey),
    ctx.redis.get(`pvp:active:${defenderId}`),
  ]);
  if (alreadyActive) {
    await replyWithSuppression(
      message,
      `⚔️ Zaten aktif bir PvP'n var, önce onu bitir.`,
      SuppressionKeys.pvp('already-active'),
    );
    return;
  }
  if (defenderActive) {
    await replyWithSuppression(
      message,
      `⚔️ Rakip şu an başka bir PvP'de.`,
      SuppressionKeys.pvp('defender-busy'),
    );
    return;
  }

  // Sadece challenger'ın lock'unu al (atomik NX)
  const acquired = await acquirePvpActiveLock(ctx.redis, message.author.id, 60);
  if (!acquired) {
    await replyWithSuppression(
      message,
      `⚔️ Zaten aktif bir PvP'n var, önce onu bitir.`,
      SuppressionKeys.pvp('already-active'),
    );
    return;
  }
  const defenderLockKey = `pvp:active:${defenderId}`;

  const sessionId = await startPvP(ctx.prisma, message.author.id, defenderId);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`pvp_accept:${sessionId}`).setLabel('✅ Kabul').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`pvp_reject:${sessionId}`).setLabel('❌ Reddet').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`pvp_cancel:${sessionId}`).setLabel('🚫 İptal').setStyle(ButtonStyle.Secondary),
  );

  const sent = await message.reply({
    content: [
      `⚔️ <@${defenderId}> düelloya davetlisin! 🦉`,
      `> **${message.member?.displayName ?? message.author.username}** seni bekliyor...`,
      `> 🏆 Ödül: XP + olası loot`,
    ].join('\n'),
    components: [row],
  });

  const collector = sent.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: PVP_DUEL_INVITE_TTL_MS,
  });

  collector.on('collect', async (i) => {
    if (i.customId.startsWith('pvp_cancel')) {
      if (i.user.id !== message.author.id) {
        await i.reply({ content: '❌ Bu butonu sadece daveti atan kullanabilir.', flags: 64 });
        return;
      }
      await ctx.prisma.pvpSession.update({ where: { id: sessionId }, data: { status: 'finished' } });
      await ctx.redis.del(pvpLockKey);
      await i.update({ content: `🚫 Duel iptal edildi.`, components: [] });
      collector.stop();
      return;
    }

    if (i.user.id !== defenderId) {
      await i.reply({ content: '❌ Bu buton sana ait degil.', flags: 64 });
      return;
    }
    if (i.customId.startsWith('pvp_reject')) {
      await ctx.prisma.pvpSession.update({ where: { id: sessionId }, data: { status: 'finished' } });
      await i.update({ content: `🚫 Meydan okuma reddedildi.`, components: [] });
      await ctx.redis.del(pvpLockKey);
      collector.stop();
      return;
    }

    const defenderAcquired = await acquirePvpActiveLock(ctx.redis, defenderId, 120);
    if (!defenderAcquired) {
      await closePvpSessionIfPending(ctx.prisma, sessionId);
      await i.update({ content: `⚔️ Rakip şu an başka bir PvP'de.`, components: [] });
      await ctx.redis.del(pvpLockKey);
      collector.stop();
      return;
    }

    await i.update({ content: `⚔️ **Savaş başlıyor...**`, components: [] });

    try {
      const result = await simulatePvP(ctx.prisma, sessionId, ctx.redis, message.guildId);
      const challengerFallback = message.member?.displayName ?? message.author.username;
      const defenderMember = message.guild?.members.cache.get(defenderId);
      const defenderFallback = defenderMember?.displayName ?? defenderId;
      const [challengerName, defenderName] = await Promise.all([
        getMainOwlBattleName(ctx.prisma, message.author.id, challengerFallback),
        getMainOwlBattleName(ctx.prisma, defenderId, defenderFallback),
      ]);

      const battleData: PvpBattleData = {
        challengerId:    message.author.id,
        challengerName,
        challengerHpMax: result.challengerHpMax,
        defenderId,
        defenderName,
        defenderHpMax:   result.defenderHpMax,
        events:          result.events,
        winnerId:        result.winnerId,
        loserId:         result.loserId,
        totalTurns:      result.turns,
        winnerXP:        result.winnerXP,
        loserXP:         15,
        streak:          result.streak,
        xpByPlayerId:    result.xpByPlayerId,
      };
      const profiles = await loadPvpDuelOwlProfiles(
        ctx.prisma,
        message.author.id,
        defenderId,
        challengerName,
        defenderName,
      );
      battleData.challengerOwl = profiles.challenger;
      battleData.defenderOwl = profiles.defender;

      animatePvPMessage(sent, battleData).catch(() => {});
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Bir hata oluştu.';
      await sent.edit({ content: `❌ ${errMsg}`, components: [] }).catch(() => null);
    } finally {
      await closePvpSessionIfPending(ctx.prisma, sessionId);
      await ctx.redis.del(pvpLockKey, defenderLockKey);
    }
    collector.stop();
  });

  collector.on('end', async (_, reason) => {
    if (reason === 'time') {
      await closePvpSessionIfPending(ctx.prisma, sessionId);
      await ctx.redis.del(pvpLockKey);  // Timeout: sadece challenger lock'unu temizle
      await sent.edit({ content: `⏰ Davet süresi doldu.`, components: [] }).catch(() => null);
    }
  });
}

// ─── Prefix: owl duel ─────────────────────────────────────────────────────────

export async function runDuelMessage(
  message: Message,
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  const userId = message.author.id;
  const cooldownKey = `cooldown:duel:${userId}`;
  const [mainOwl, cooldown] = await Promise.all([
    loadMainOwlForDuel(ctx.prisma, userId),
    peekCooldown(ctx.redis, cooldownKey),
  ]);
  if (!mainOwl) {
    await message.reply(`❌ **Hata** | Main baykuş bulunamadı.`);
    return;
  }

  if (cooldown.active) {
    const displayName = message.member?.displayName ?? message.author.displayName ?? message.author.username;
    const base = buildCooldownMessage(cooldown.remainingMs, 'duel', displayName);
    const msg = await resolveFlowRejectMessage(ctx.redis, userId, 'duel', 'cooldown', base);
    await replyWithSuppression(message, msg, SuppressionKeys.cooldown(cooldownKey));
    return;
  }

  const sent = await safeReply(message, `⚔️ **Rakip aranıyor...**`);
  if (!sent) return;
  const result = await runSimulatedPvP(ctx.prisma, userId, ctx.redis, mainOwl);
  await armCooldown(ctx.redis, cooldownKey, SIM_PVP_COOLDOWN_MS);

  void animateSimPvPMessage(
    sent,
    userId,
    mainOwl,
    mainOwl.hpMax,
    result,
    resolveDiscordDisplayName(message.member, message.author),
  ).catch((err) => {
    console.error('[Duel] Animasyon hatasi:', err instanceof Error ? err.message : err);
  });
}
