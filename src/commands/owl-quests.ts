import { EmbedBuilder, type Message, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, type ChatInputCommandInteraction } from 'discord.js';
import { ensureDailyQuests, claimQuestReward } from '../systems/daily-quests';
import { successEmbed, failEmbed, infoEmbed } from '../utils/embed';
import { DAILY_QUEST_CONFIG } from '../config';
import type { CommandContext } from '../types';

/**
 * /owl quests komutu (UI)
 */
export async function runQuestsMessage(
  message: Message,
  args: string[],
  ctx: CommandContext,
  prefix: string
) {
  const userId = message.author.id;

  await ensureDailyQuests(ctx.prisma, userId);

  const quests = await ctx.prisma.dailyQuest.findMany({
    where: { playerId: userId, resetAt: { gt: new Date() } }
  });

  if (quests.length === 0) {
    await message.reply({ embeds: [infoEmbed('Günlük Görevler', 'Şu anda aktif görev bulunmuyor.')] });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('📅 Günlük Görevler')
    .setDescription('Görevleri tamamla ve ödülleri topla! Görevler her gece yarısı sıfırlanır.')
    .setColor(0xf1c40f);

  const row = new ActionRowBuilder<ButtonBuilder>();

  quests.forEach((q, i) => {
    const cfg = DAILY_QUEST_CONFIG[q.type as keyof typeof DAILY_QUEST_CONFIG];
    const status = q.isClaimed ? '✅ Alındı' : q.current >= q.target ? '🌟 Tamamlandı' : `⏳ ${q.current}/${q.target}`;

    embed.addFields({
      name: `${i + 1}. ${cfg.label}`,
      value: `Durum: **${status}**\nÖdül: **${q.rewardCoins}** 💰, **${q.rewardXp}** XP`,
      inline: false
    });

    if (!q.isClaimed && q.current >= q.target) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`claim_quest:${q.id}`)
          .setLabel(`${i + 1}. Ödülü Al`)
          .setStyle(ButtonStyle.Success)
      );
    }
  });

  const sent = await message.reply({
    embeds: [embed],
    components: row.components.length > 0 ? [row] : []
  });

  if (row.components.length > 0) {
    const collector = sent.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000,
      filter: (i) => i.user.id === userId && i.customId.startsWith('claim_quest:')
    });

    collector.on('collect', async (i) => {
      const questId = i.customId.split(':')[1];
      if (!questId) return;

      try {
        const reward = await claimQuestReward(ctx.prisma, userId, questId);
        await i.update({
          content: `🎉 **Görev Ödülü Alındı!**\nKazancın: **${reward.coins}** 💰 ve **${reward.xp}** XP${reward.levelUp ? '\n🆙 **LEVEL UP!**' : ''}`,
          embeds: [],
          components: []
        });
      } catch (err: any) {
        await i.reply({ content: `❌ ${err.message}`, flags: 64 });
      }
    });
  }
}

/**
 * Slash: /owl quests
 */
export async function runQuestsSlash(interaction: ChatInputCommandInteraction, ctx: CommandContext): Promise<any> {
  const userId = interaction.user.id;

  await ensureDailyQuests(ctx.prisma, userId);

  const quests = await ctx.prisma.dailyQuest.findMany({
    where: { playerId: userId, resetAt: { gt: new Date() } }
  });

  if (quests.length === 0) {
    return interaction.reply({ embeds: [infoEmbed('Günlük Görevler', 'Şu anda aktif görev bulunmuyor.')], flags: 64 });
  }

  const embed = new EmbedBuilder()
    .setTitle('📅 Günlük Görevler')
    .setDescription('Görevleri tamamla ve ödülleri topla! Görevler her gece yarısı sıfırlanır.')
    .setColor(0xf1c40f);

  const row = new ActionRowBuilder<ButtonBuilder>();

  quests.forEach((q, i) => {
    const cfg = DAILY_QUEST_CONFIG[q.type as keyof typeof DAILY_QUEST_CONFIG];
    const status = q.isClaimed ? '✅ Alındı' : q.current >= q.target ? '🌟 Tamamlandı' : `⏳ ${q.current}/${q.target}`;

    embed.addFields({
      name: `${i + 1}. ${cfg.label}`,
      value: `Durum: **${status}**\nÖdül: **${q.rewardCoins}** 💰, **${q.rewardXp}** XP`,
      inline: false
    });

    if (!q.isClaimed && q.current >= q.target) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`claim_quest_slash:${q.id}`)
          .setLabel(`${i + 1}. Ödülü Al`)
          .setStyle(ButtonStyle.Success)
      );
    }
  });

  const sent = await interaction.reply({
    embeds: [embed],
    components: row.components.length > 0 ? [row] : [],
    flags: 64
  });

  if (row.components.length > 0) {
    const collector = interaction.channel?.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60000,
      filter: (i) => i.user.id === userId && i.customId.startsWith('claim_quest_slash:')
    });

    collector?.on('collect', async (i) => {
      const questId = i.customId.split(':')[1];
      if (!questId) return;

      try {
        const reward = await claimQuestReward(ctx.prisma, userId, questId);
        await i.update({
          content: `🎉 **Görev Ödülü Alındı!**\nKazancın: **${reward.coins}** 💰 ve **${reward.xp}** XP${reward.levelUp ? '\n🆙 **LEVEL UP!**' : ''}`,
          embeds: [],
          components: []
        });
      } catch (err: any) {
        await i.reply({ content: `❌ ${err.message}`, flags: 64 });
      }
    });
  }
}
