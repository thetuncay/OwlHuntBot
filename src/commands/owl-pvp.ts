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
import { SIM_PVP_COOLDOWN_MS } from '../config';
import { getCooldownRemainingMs } from '../middleware/cooldown';
import { simulatePvP, startPvP } from '../systems/pvp';
import { runSimulatedPvP } from '../systems/pvp-sim';
import {
  animatePvPInteraction,
  animatePvPMessage,
  animateSimPvPInteraction,
  animateSimPvPMessage,
} from '../utils/pvp-ux';
import type { PvpBattleData } from '../utils/pvp-ux';
import { failEmbed } from '../utils/embed';
import type { CommandDefinition } from '../types';

// ─── Slash: /owl vs ───────────────────────────────────────────────────────────

export async function runVs(
  interaction: Parameters<CommandDefinition['execute']>[0],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  const defender = interaction.options.getUser('kullanici', true);
  if (defender.id === interaction.user.id) {
    await interaction.reply({ content: `❌ Kendinle PvP yapamazsın.`, flags: 64 });
    return;
  }

  const challengerName = interaction.member && 'displayName' in interaction.member
    ? (interaction.member as { displayName: string }).displayName
    : interaction.user.username;

  const pvpLockKey = `pvp:active:${interaction.user.id}`;

  const challengerActive = await ctx.redis.get(pvpLockKey);
  if (challengerActive) {
    await interaction.reply({ content: `⚔️ Zaten aktif bir PvP'n var.`, flags: 64 });
    return;
  }

  // Defender'ın lock'unu kontrol et ama ALMA — sadece kabul ettiğinde alınacak
  const defenderLockKey = `pvp:active:${defender.id}`;
  const defenderActive  = await ctx.redis.get(defenderLockKey);
  if (defenderActive) {
    await interaction.reply({ content: `⚔️ Rakip şu an başka bir PvP'de.`, flags: 64 });
    return;
  }

  // Sadece challenger'ın lock'unu al (60 saniye)
  await ctx.redis.set(pvpLockKey, '1', 'EX', 60);

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
    time: 60_000,
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

    // Kabul edildi — ŞİMDİ defender'ın lock'unu al
    await ctx.redis.set(defenderLockKey, '1', 'EX', 120);  // Savaş süresi için 2 dakika

    await i.update({ content: `⚔️ **Savaş başlıyor...**`, components: [] });

    try {
      const result = await simulatePvP(ctx.prisma, sessionId);
      const defenderName = defender.displayName ?? defender.username;

      const battleData: PvpBattleData = {
        challengerId:    interaction.user.id,
        challengerName,
        challengerHpMax: result.challengerHpMax,
        defenderId:      defender.id,
        defenderName,
        defenderHpMax:   result.defenderHpMax,
        events:          result.events,
        winnerId:        result.winnerId,
        loserId:         result.loserId,
        totalTurns:      result.turns,
        winnerXP:        result.winnerXP,
        loserXP:         15,
        streak:          result.streak,
      };

      await animatePvPInteraction(interaction, battleData);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Bir hata oluştu.';
      await interaction.editReply({ content: `❌ ${errMsg}` }).catch(() => null);
    } finally {
      await ctx.redis.del(pvpLockKey, defenderLockKey);  // Savaş bitti, her ikisini temizle
    }
    collector.stop();
  });

  collector.on('end', async (_, reason) => {
    if (reason === 'time') {
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
  const remaining = await getCooldownRemainingMs(ctx.redis, cooldownKey, SIM_PVP_COOLDOWN_MS);

  if (remaining > 0) {
    await interaction.reply({
      content: `⏰ Tekrar duel için **${Math.ceil(remaining / 1000)}s** beklemelisin.`,
      flags: 64,
    });
    return;
  }

  const mainOwl = await ctx.prisma.owl.findFirst({
    where: { ownerId: userId, isMain: true },
    select: { hp: true, hpMax: true },
  });
  if (!mainOwl) {
    await interaction.reply({ embeds: [failEmbed('Hata', 'Main baykuş bulunamadı.')], flags: 64 });
    return;
  }
  if (mainOwl.hp <= 0) {
    await interaction.reply({ content: `❌ Main baykuşunun HP'si 0 — önce tamir et.`, flags: 64 });
    return;
  }

  await interaction.deferReply();

  const result = await runSimulatedPvP(ctx.prisma, userId);
  const playerName = interaction.member && 'displayName' in interaction.member
    ? (interaction.member as { displayName: string }).displayName
    : interaction.user.username;

  await animateSimPvPInteraction(interaction, userId, playerName, mainOwl.hpMax, result);
  await ctx.redis.set(cooldownKey, '1', 'PX', SIM_PVP_COOLDOWN_MS);
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
    await message.reply(`❌ **Kullanım:** owl vs @oyuncu`);
    return;
  }
  if (defenderId === message.author.id) {
    await message.reply(`❌ **Hata** | Kendinle PvP yapamazsin.`);
    return;
  }

  const pvpLockKey = `pvp:active:${message.author.id}`;

  const [alreadyActive, defenderActive] = await Promise.all([
    ctx.redis.get(pvpLockKey),
    ctx.redis.get(`pvp:active:${defenderId}`),
  ]);
  if (alreadyActive) {
    await message.reply(`⚔️ Zaten aktif bir PvP'n var, önce onu bitir.`);
    return;
  }
  if (defenderActive) {
    await message.reply(`⚔️ Rakip şu an başka bir PvP'de.`);
    return;
  }

  // Sadece challenger'ın lock'unu al
  await ctx.redis.set(pvpLockKey, '1', 'EX', 60);
  const defenderLockKey = `pvp:active:${defenderId}`;

  const sessionId = await startPvP(ctx.prisma, message.author.id, defenderId);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`pvp_accept:${sessionId}`).setLabel('✅ Kabul').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`pvp_reject:${sessionId}`).setLabel('❌ Reddet').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`pvp_cancel:${sessionId}`).setLabel('🚫 İptal').setStyle(ButtonStyle.Secondary),
  );

  const sent = await message.reply({
    content: `⚔️ <@${defenderId}> duelloya davetlisin! 🦉\n> **${message.member?.displayName ?? message.author.username}** seni bekliyor...`,
    components: [row],
  });

  const collector = sent.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60_000,
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

    // Kabul edildi — ŞİMDİ defender'ın lock'unu al
    await ctx.redis.set(defenderLockKey, '1', 'EX', 120);

    await i.update({ content: `⚔️ **Savaş başlıyor...**`, components: [] });

    try {
      const result = await simulatePvP(ctx.prisma, sessionId);
      const challengerName = message.member?.displayName ?? message.author.username;
      const defenderMember = message.guild?.members.cache.get(defenderId);
      const defenderName   = defenderMember?.displayName ?? defenderId;

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
      };

      await animatePvPMessage(sent, battleData);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Bir hata oluştu.';
      await sent.edit({ content: `❌ ${errMsg}`, components: [] }).catch(() => null);
    } finally {
      await ctx.redis.del(pvpLockKey, defenderLockKey);
    }
    collector.stop();
  });

  collector.on('end', async (_, reason) => {
    if (reason === 'time') {
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
  const remaining = await getCooldownRemainingMs(ctx.redis, cooldownKey, SIM_PVP_COOLDOWN_MS);

  if (remaining > 0) {
    await message.reply(`⏰ Tekrar duel için **${Math.ceil(remaining / 1000)}s** beklemelisin.`);
    return;
  }

  const mainOwl = await ctx.prisma.owl.findFirst({
    where: { ownerId: userId, isMain: true },
    select: { hp: true, hpMax: true },
  });
  if (!mainOwl) {
    await message.reply(`❌ **Hata** | Main baykuş bulunamadı.`);
    return;
  }
  if (mainOwl.hp <= 0) {
    await message.reply(`❌ Main baykuşunun HP'si 0 — önce tamir et.`);
    return;
  }

  const sent = await message.reply(`⚔️ **Rakip aranıyor...**`);
  const result = await runSimulatedPvP(ctx.prisma, userId);
  const playerName = message.member?.displayName ?? message.author.username;

  await animateSimPvPMessage(sent, userId, playerName, mainOwl.hpMax, result);
  await ctx.redis.set(cooldownKey, '1', 'PX', SIM_PVP_COOLDOWN_MS);
}
