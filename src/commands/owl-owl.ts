/**
 * owl-owl.ts — /owl setmain ve /owl owls komutları
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
  type Message,
} from 'discord.js';
import { HUNT_COOLDOWN_MS, SWITCH_COOLDOWN_MS, SWITCH_HP_THRESHOLD, SWITCH_PENALTY_DURATION } from '../config';
import { getCooldownRemainingMs } from '../middleware/cooldown';
import { switchCost } from '../utils/math';
import { withLock } from '../utils/lock';
import { formatDuration } from '../utils/format';
import { successEmbed, warningEmbed, failEmbed } from '../utils/embed';
import type { CommandDefinition } from '../types';

// Prisma Owl modelinin lokal tip tanımı (generate edilmemiş @prisma/client için)
type OwlRecord = {
  id: string; ownerId: string; species: string; tier: number; bond: number;
  statGaga: number; statGoz: number; statKulak: number; statKanat: number; statPence: number;
  quality: string; hp: number; hpMax: number; staminaCur: number; isMain: boolean;
  effectiveness: number; createdAt: Date; passiveMode: string; traits: unknown;
};

// ─── Slash: /owl setmain ──────────────────────────────────────────────────────

export async function runSetMain(
  interaction: Parameters<CommandDefinition['execute']>[0],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  const userId = interaction.user.id;
  const owlId  = interaction.options.getString('baykus', true);

  const cooldown = await getCooldownRemainingMs(ctx.redis, `cooldown:switch:${userId}`, SWITCH_COOLDOWN_MS);
  if (cooldown > 0) {
    await interaction.reply({
      embeds: [warningEmbed('Switch Cooldown', `${formatDuration(cooldown)} sonra tekrar deneyebilirsin.`)],
      flags: 64,
    });
    return;
  }

  await withLock(userId, 'setmain', async () => {
    await ctx.prisma.$transaction(async (tx: any) => {
      const activePvp = await tx.pvpSession.findFirst({
        where: { OR: [{ challengerId: userId }, { defenderId: userId }], status: { in: ['pending', 'active'] } },
      });
      if (activePvp) throw new Error('Aktif PvP devam ederken main degistirilemez.');

      const player = await tx.player.findUnique({ where: { id: userId } });
      if (!player) throw new Error('Oyuncu bulunamadi.');
      if (player.lastHunt && Date.now() - player.lastHunt.getTime() < HUNT_COOLDOWN_MS) {
        throw new Error('Aktif av suresi devam ederken main degistirilemez.');
      }

      const target = await tx.owl.findUnique({ where: { id: owlId } });
      if (!target || target.ownerId !== userId) throw new Error('Gecersiz baykus secimi.');
      if (target.hp / target.hpMax < SWITCH_HP_THRESHOLD) throw new Error('HP %30 altinda oldugu icin yasak.');

      const allOwls  = await tx.owl.findMany({ where: { ownerId: userId }, select: { tier: true } });
      const totalTier = allOwls.reduce((sum: number, owl: { tier: number }) => sum + owl.tier, 0);
      const cost      = switchCost(totalTier);
      if (player.coins < cost) throw new Error(`Yetersiz coin. Gerekli: ${cost} 💰`);

      await tx.owl.updateMany({ where: { ownerId: userId }, data: { isMain: false } });
      await tx.owl.update({ where: { id: owlId }, data: { isMain: true } });
      await tx.player.update({
        where: { id: userId },
        data: {
          coins:             { decrement: cost },
          lastSwitch:        new Date(),
          switchPenaltyUntil: new Date(Date.now() + SWITCH_PENALTY_DURATION),
        },
      });
    });
  });

  await interaction.reply({ embeds: [successEmbed('Main Degisti', 'Yeni main baykus aktif. 🦉')], flags: 64 });
}

// ─── Prefix: owl setmain ──────────────────────────────────────────────────────

export async function runSetMainMessage(
  message: Message,
  args: string[],
  ctx: Parameters<CommandDefinition['execute']>[1],
  helpPrefix: string,
): Promise<void> {
  const owlId = args[0];
  if (!owlId) {
    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('🔄 Setmain — Main Baykuş Değiştirme')
      .setDescription('> Envanterindeki başka bir baykuşu main olarak ayarla.')
      .addFields(
        { name: '📋 Kullanım', value: `\`${helpPrefix} setmain <baykusId>\``, inline: false },
        {
          name: '💰 Maliyet',
          value: 'Maliyet = **500** + (tüm baykuşların tier toplamı × **200**)',
          inline: false,
        },
        {
          name: '⚠️ Kısıtlamalar',
          value: [
            '• Hedef baykuşun HP\'si **%30\'un altındaysa** değiştiremezsin.',
            '• Aktif **PvP** devam ederken değiştiremezsin.',
            '• Değiştirme sonrası **1 saat** cooldown uygulanır.',
            '• Değiştirme sonrası **10 dakika** boyunca hasar ve dodge cezası alırsın.',
          ].join('\n'),
          inline: false,
        },
      )
      .setFooter({ text: 'Baykuş ID\'ni öğrenmek için inventory komutunu kullan.' });
    await message.reply({ embeds: [embed] });
    return;
  }

  const userId = message.author.id;
  const cooldown = await getCooldownRemainingMs(ctx.redis, `cooldown:switch:${userId}`, SWITCH_COOLDOWN_MS);
  if (cooldown > 0) {
    await message.reply(`⏰ **Switch Cooldown** | ${formatDuration(cooldown)} sonra tekrar deneyebilirsin.`);
    return;
  }

  await withLock(userId, 'setmain', async () => {
    await ctx.prisma.$transaction(async (tx: any) => {
      const activePvp = await tx.pvpSession.findFirst({
        where: { OR: [{ challengerId: userId }, { defenderId: userId }], status: { in: ['pending', 'active'] } },
      });
      if (activePvp) throw new Error('Aktif PvP devam ederken main degistirilemez.');

      const player = await tx.player.findUnique({ where: { id: userId } });
      if (!player) throw new Error('Oyuncu bulunamadi.');
      if (player.lastHunt && Date.now() - player.lastHunt.getTime() < HUNT_COOLDOWN_MS) {
        throw new Error('Aktif av suresi devam ederken main degistirilemez.');
      }

      const target = await tx.owl.findUnique({ where: { id: owlId } });
      if (!target || target.ownerId !== userId) throw new Error('Gecersiz baykus secimi.');
      if (target.hp / target.hpMax < SWITCH_HP_THRESHOLD) throw new Error('HP %30 altinda oldugu icin yasak.');

      const allOwls   = await tx.owl.findMany({ where: { ownerId: userId }, select: { tier: true } });
      const totalTier = allOwls.reduce((sum: number, owl: { tier: number }) => sum + owl.tier, 0);
      const cost      = switchCost(totalTier);
      if (player.coins < cost) throw new Error(`Yetersiz coin. Gerekli: ${cost} 💰`);

      await tx.owl.updateMany({ where: { ownerId: userId }, data: { isMain: false } });
      await tx.owl.update({ where: { id: owlId }, data: { isMain: true } });
      await tx.player.update({
        where: { id: userId },
        data: {
          coins:              { decrement: cost },
          lastSwitch:         new Date(),
          switchPenaltyUntil: new Date(Date.now() + SWITCH_PENALTY_DURATION),
        },
      });
    });
  });

  await message.reply(`✅ **Main Degisti** | Yeni main baykus aktif. 🦉`);
}

// ─── Slash: /owl owls ─────────────────────────────────────────────────────────

export async function runOwls(
  interaction: Parameters<CommandDefinition['execute']>[0],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  const userId = interaction.user.id;
  const owls   = await ctx.prisma.owl.findMany({
    where:   { ownerId: userId },
    orderBy: [{ isMain: 'desc' }, { tier: 'asc' }, { quality: 'asc' }],
  });

  if (owls.length === 0) {
    await interaction.reply({
      content: `🦉 Henüz hiç baykuşun yok. \`owl hunt\` yaparak yabani baykuşlarla karşılaşabilirsin.`,
      flags: 64,
    });
    return;
  }

  const username = interaction.member && 'displayName' in interaction.member
    ? (interaction.member as { displayName: string }).displayName
    : interaction.user.username;

  const OWLS_PER_PAGE = 4;
  let page            = 0;
  const totalPages    = Math.max(1, Math.ceil(owls.length / OWLS_PER_PAGE));
  let currentOwls     = [...owls];

  const QUALITY_EMOJI: Record<string, string> = {
    'Trash': '⬛', 'Common': '⬜', 'Good': '🟩',
    'Rare': '🟦', 'Elite': '🟪', 'God Roll': '🌟',
  };

  const renderEmbed = () => {
    const pageOwls = currentOwls.slice(page * OWLS_PER_PAGE, (page + 1) * OWLS_PER_PAGE);
    const lines = pageOwls.map((owl) => {
      const mainTag = owl.isMain ? ' ⭐ **MAIN**' : '';
      const qEmoji  = QUALITY_EMOJI[owl.quality] ?? '⬜';
      const statSum = owl.statGaga + owl.statGoz + owl.statKulak + owl.statKanat + owl.statPence;
      const hpWarn  = owl.hp / owl.hpMax < 0.3 ? ' ⚠️' : '';
      return (
        `${qEmoji} **${owl.species}**${mainTag}\n` +
        `> Tier ${owl.tier} · ${owl.quality} · HP ${owl.hp}/${owl.hpMax}${hpWarn} · Güç ${statSum}\n` +
        `> Gaga:${owl.statGaga} Göz:${owl.statGoz} Kulak:${owl.statKulak} Kanat:${owl.statKanat} Pençe:${owl.statPence}`
      );
    });
    return new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`🦉 ${username}'in Baykuşları`)
      .setDescription(lines.join('\n\n') || '*Bu sayfada baykuş yok.*')
      .setFooter({ text: totalPages > 1 ? `${currentOwls.length} baykuş · Sayfa ${page + 1}/${totalPages}` : `${currentOwls.length} baykuş` });
  };

  const renderComponents = () => {
    const pageOwls = currentOwls.slice(page * OWLS_PER_PAGE, (page + 1) * OWLS_PER_PAGE);
    const rows: ActionRowBuilder<ButtonBuilder>[] = pageOwls.map((owl) =>
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        owl.isMain
          ? new ButtonBuilder().setCustomId('setmain_noop').setLabel('✅ Main').setStyle(ButtonStyle.Success).setDisabled(true)
          : new ButtonBuilder().setCustomId(`setmain:${owl.id}`).setLabel('⭐ Main Yap').setStyle(ButtonStyle.Primary),
      ),
    );
    if (totalPages > 1) {
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('owls_prev').setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(totalPages <= 1),
        new ButtonBuilder().setCustomId('owls_next').setLabel('▶').setStyle(ButtonStyle.Primary).setDisabled(totalPages <= 1),
      ));
    }
    return rows;
  };

  await interaction.reply({ embeds: [renderEmbed()], components: renderComponents(), flags: 64 });

  const msg       = await interaction.fetchReply();
  const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 90_000 });

  collector.on('collect', async (i) => {
    if (i.user.id !== userId) {
      await i.reply({ content: '❌ Bu buton sana ait değil.', flags: 64 });
      return;
    }

    if (i.customId === 'owls_prev') { page = (page - 1 + totalPages) % totalPages; }
    else if (i.customId === 'owls_next') { page = (page + 1) % totalPages; }
    else if (i.customId.startsWith('setmain:')) {
      const targetOwlId = i.customId.split(':')[1]!;
      try {
        const cooldown = await getCooldownRemainingMs(ctx.redis, `cooldown:switch:${userId}`, SWITCH_COOLDOWN_MS);
        if (cooldown > 0) {
          await i.reply({ content: `⏰ Switch cooldown: ${formatDuration(cooldown)}`, flags: 64 });
          return;
        }
        await withLock(userId, 'setmain', async () => {
          await ctx.prisma.$transaction(async (tx: any) => {
            const player = await tx.player.findUnique({ where: { id: userId } });
            if (!player) throw new Error('Oyuncu bulunamadi.');
            const target = await tx.owl.findUnique({ where: { id: targetOwlId } });
            if (!target || target.ownerId !== userId) throw new Error('Gecersiz baykus.');
            if (target.hp / target.hpMax < SWITCH_HP_THRESHOLD) throw new Error('HP %30 altinda.');
            const allOwls   = await tx.owl.findMany({ where: { ownerId: userId }, select: { tier: true } });
            const totalTier = allOwls.reduce((s: number, o: { tier: number }) => s + o.tier, 0);
            const cost      = switchCost(totalTier);
            if (player.coins < cost) throw new Error(`Yetersiz coin. Gerekli: ${cost} 💰`);
            await tx.owl.updateMany({ where: { ownerId: userId }, data: { isMain: false } });
            await tx.owl.update({ where: { id: targetOwlId }, data: { isMain: true } });
            await tx.player.update({
              where: { id: userId },
              data: { coins: { decrement: cost }, lastSwitch: new Date(), switchPenaltyUntil: new Date(Date.now() + SWITCH_PENALTY_DURATION) },
            });
          });
        });
        // Listeyi güncelle
        currentOwls = currentOwls.map((o) => ({ ...o, isMain: o.id === targetOwlId }));
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Bir hata oluştu.';
        await i.reply({ embeds: [failEmbed('Hata', errMsg)], flags: 64 });
        return;
      }
    }

    await i.update({ embeds: [renderEmbed()], components: renderComponents() });
  });
}

// ─── Prefix: owl owls ─────────────────────────────────────────────────────────

export async function runOwlsMessage(
  message: Message,
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  const userId = message.author.id;
  const owls: OwlRecord[] = await ctx.prisma.owl.findMany({
    where:   { ownerId: userId },
    orderBy: [{ isMain: 'desc' }, { tier: 'asc' }, { quality: 'asc' }],
  }) as OwlRecord[];

  const name = message.member?.displayName ?? message.author.username;

  if (owls.length === 0) {
    await message.reply(`🦉 **${name}** — Henüz hiç baykuşun yok.`);
    return;
  }

  const QUALITY_EMOJI: Record<string, string> = {
    'Trash': '⬛', 'Common': '⬜', 'Good': '🟩',
    'Rare': '🟦', 'Elite': '🟪', 'God Roll': '🌟',
  };

  const OWLS_PER_PAGE = 4;
  let page            = 0;
  const totalPages    = Math.max(1, Math.ceil(owls.length / OWLS_PER_PAGE));
  let currentOwls     = [...owls];

  const renderEmbed = () => {
    const pageOwls = currentOwls.slice(page * OWLS_PER_PAGE, (page + 1) * OWLS_PER_PAGE);
    const lines = pageOwls.map((owl) => {
      const mainTag = owl.isMain ? ' ⭐ **MAIN**' : '';
      const qEmoji  = QUALITY_EMOJI[owl.quality] ?? '⬜';
      const statSum = owl.statGaga + owl.statGoz + owl.statKulak + owl.statKanat + owl.statPence;
      const hpWarn  = owl.hp / owl.hpMax < 0.3 ? ' ⚠️' : '';
      return (
        `${qEmoji} **${owl.species}**${mainTag}\n` +
        `> Tier ${owl.tier} · ${owl.quality} · HP ${owl.hp}/${owl.hpMax}${hpWarn} · Güç ${statSum}\n` +
        `> Gaga:${owl.statGaga} Göz:${owl.statGoz} Kulak:${owl.statKulak} Kanat:${owl.statKanat} Pençe:${owl.statPence}`
      );
    });
    return new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`🦉 ${name}'in Baykuşları`)
      .setDescription(lines.join('\n\n') || '*Bu sayfada baykuş yok.*')
      .setFooter({ text: totalPages > 1 ? `${currentOwls.length} baykuş · Sayfa ${page + 1}/${totalPages}` : `${currentOwls.length} baykuş` });
  };

  const renderComponents = () => {
    const pageOwls = currentOwls.slice(page * OWLS_PER_PAGE, (page + 1) * OWLS_PER_PAGE);
    const rows: ActionRowBuilder<ButtonBuilder>[] = pageOwls.map((owl) =>
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        owl.isMain
          ? new ButtonBuilder().setCustomId('setmain_noop').setLabel('✅ Main').setStyle(ButtonStyle.Success).setDisabled(true)
          : new ButtonBuilder().setCustomId(`setmain:${owl.id}`).setLabel('⭐ Main Yap').setStyle(ButtonStyle.Primary),
      ),
    );
    if (totalPages > 1) {
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId('owls_prev').setLabel('◀').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('owls_next').setLabel('▶').setStyle(ButtonStyle.Primary),
      ));
    }
    return rows;
  };

  const sent = await message.reply({ embeds: [renderEmbed()], components: renderComponents() });

  const collector = sent.createMessageComponentCollector({ componentType: ComponentType.Button, time: 90_000 });

  collector.on('collect', async (i) => {
    if (i.user.id !== userId) {
      await i.reply({ content: '❌ Bu buton sana ait değil.', flags: 64 });
      return;
    }

    if (i.customId === 'owls_prev') { page = (page - 1 + totalPages) % totalPages; }
    else if (i.customId === 'owls_next') { page = (page + 1) % totalPages; }
    else if (i.customId.startsWith('setmain:')) {
      const targetOwlId = i.customId.split(':')[1]!;
      try {
        const cooldown = await getCooldownRemainingMs(ctx.redis, `cooldown:switch:${userId}`, SWITCH_COOLDOWN_MS);
        if (cooldown > 0) {
          await i.reply({ content: `⏰ Switch cooldown: ${formatDuration(cooldown)}`, flags: 64 });
          return;
        }
        await withLock(userId, 'setmain', async () => {
          await ctx.prisma.$transaction(async (tx: any) => {
            const player = await tx.player.findUnique({ where: { id: userId } });
            if (!player) throw new Error('Oyuncu bulunamadi.');
            const target = await tx.owl.findUnique({ where: { id: targetOwlId } });
            if (!target || target.ownerId !== userId) throw new Error('Gecersiz baykus.');
            if (target.hp / target.hpMax < SWITCH_HP_THRESHOLD) throw new Error('HP %30 altinda.');
            const allOwls   = await tx.owl.findMany({ where: { ownerId: userId }, select: { tier: true } });
            const totalTier = allOwls.reduce((s: number, o: { tier: number }) => s + o.tier, 0);
            const cost      = switchCost(totalTier);
            if (player.coins < cost) throw new Error(`Yetersiz coin. Gerekli: ${cost} 💰`);
            await tx.owl.updateMany({ where: { ownerId: userId }, data: { isMain: false } });
            await tx.owl.update({ where: { id: targetOwlId }, data: { isMain: true } });
            await tx.player.update({
              where: { id: userId },
              data: { coins: { decrement: cost }, lastSwitch: new Date(), switchPenaltyUntil: new Date(Date.now() + SWITCH_PENALTY_DURATION) },
            });
          });
        });
        currentOwls = currentOwls.map((o) => ({ ...o, isMain: o.id === targetOwlId }));
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Bir hata oluştu.';
        await i.reply({ embeds: [failEmbed('Hata', errMsg)], flags: 64 });
        return;
      }
    }

    await i.update({ embeds: [renderEmbed()], components: renderComponents() });
  });
}
