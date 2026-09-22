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
import { HUNT_COOLDOWN_MS, SWITCH_COOLDOWN_MS, SWITCH_PENALTY_DURATION } from '../config';
import { COIN_EMOJI, formatCoinLabel } from '../config/ui-emojis';
import { armCooldown, peekCooldown } from '../middleware/cooldown-manager';
import { switchCost } from '../utils/math';
import { COLORS } from '../utils/theme';
import { withLock } from '../utils/lock';
import { successEmbed, failEmbed } from '../utils/embed';
import type { CommandDefinition } from '../types';
import { syncPlayerStateAfterPgWrite, rehydratePlayerState } from '../state/player-state';
import { formatShortOwlId, resolveOwlByInput } from '../utils/owl-id';
import { formatOwlIdentityBlock } from '../utils/owl-display';
import { resolveDiscordDisplayName } from '../utils/player-display-name';
import { isOwlNicknameClearCommand, validateOwlNickname } from '../utils/owl-nickname';
import { fireQuest } from '../systems/quest-tracker';
import { invalidatePlayerCache } from '../utils/player-cache';
import { buildCooldownMessage } from '../utils/command-error';
import {
  interactionReplyWithSuppression,
  replyCooldownIfAllowed,
  replyWithSuppression,
  SuppressionKeys,
} from '../utils/guarded-discord';
import { qualityMark } from '../utils/theme';
import { reconcilePlayerOwlMoonTiers } from '../systems/owl-moon-evolution';
import { buildOwlsZooMessages } from '../utils/owls-ux';
import { buildOwllistPageRow, buildOwllistPageText, getOwllistPageCount, parseOwllistPage, type OwllistRenderData } from '../utils/owllist-ux';
import { isPlayerBlockedForMainSwitch } from '../systems/pvp';

// Prisma Owl modelinin lokal tip tanımı (generate edilmemiş @prisma/client için)
interface OwlRecord {
  id: string; ownerId: string; species: string; nickname?: string | null; tier: number; bond: number;
  moonTier?: number;
  statGaga: number; statGoz: number; statKulak: number; statKanat: number; statPence: number;
  quality: string; hp: number; hpMax: number; staminaCur: number; isMain: boolean;
  effectiveness: number; createdAt: Date; passiveMode: string; traits: unknown;
}

function calcSwitchFee(owls: { tier: number }[]): number {
  return switchCost(owls.reduce((s, o) => s + o.tier, 0));
}

function formatSwitchFee(owls: { tier: number }[]): string {
  return calcSwitchFee(owls).toLocaleString('tr-TR');
}

const OWLLIST_COLLECTOR_TTL_MS = 90_000;

async function replyOwllistPaginated(
  send: (payload: { content: string; components: ActionRowBuilder<ButtonBuilder>[] }) => Promise<Message>,
  ownerId: string,
  data: OwllistRenderData,
  initialPage: number,
): Promise<void> {
  const totalPages = getOwllistPageCount(data.owls.length);
  let page = parseOwllistPage(String(initialPage), totalPages);

  const render = (p: number) => {
    const safePage = Math.min(Math.max(1, p), totalPages);
    const content = buildOwllistPageText(data, safePage);
    const row = buildOwllistPageRow(safePage, totalPages);
    return { content, components: row ? [row] : [] as ActionRowBuilder<ButtonBuilder>[] };
  };

  const initial = render(page);
  const msg = await send(initial);
  if (totalPages <= 1) return;

  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: OWLLIST_COLLECTOR_TTL_MS,
  });

  collector.on('collect', async (i) => {
    if (i.user.id !== ownerId) {
      await i.reply({ content: '❌ Bu buton sana ait değil.', flags: 64 });
      return;
    }
    if (i.customId === 'owllist_prev') page = Math.max(1, page - 1);
    else if (i.customId === 'owllist_next') page = Math.min(totalPages, page + 1);
    const next = render(page);
    await i.update({ content: next.content, components: next.components });
  });

  collector.on('end', async () => {
    try {
      const final = render(page);
      const row = buildOwllistPageRow(page, totalPages, true);
      await msg.edit({
        content: final.content,
        components: row ? [row] : [],
      });
    } catch { /* mesaj silinmiş */ }
  });
}

function owlsListHeader(owls: { tier: number }[]): string {
  return `Main değiştirme ücreti: ${formatCoinLabel(calcSwitchFee(owls))}\n\n`;
}

// ─── Slash: /owl setmain ──────────────────────────────────────────────────────

export async function runSetMain(
  interaction: Parameters<CommandDefinition['execute']>[0],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  const userId = interaction.user.id;
  const owlInput = interaction.options.getString('baykus', true);

  const cooldown = await peekCooldown(ctx.redis, `cooldown:switch:${userId}`);
  if (cooldown.active) {
    const switchKey = `cooldown:switch:${userId}`;
    await interactionReplyWithSuppression(
      interaction,
      {
        content: buildCooldownMessage(
          cooldown.remainingMs,
          'switch',
          interaction.member && 'displayName' in interaction.member
            ? (interaction.member as { displayName: string }).displayName
            : interaction.user.username,
        ),
        flags: 64,
      },
      SuppressionKeys.cooldown(switchKey),
    );
    return;
  }

  let resolvedOwl;
  try {
    resolvedOwl = await resolveOwlByInput(ctx.prisma, userId, owlInput);
  } catch (err) {
    await interaction.reply({
      embeds: [failEmbed('Hata', err instanceof Error ? err.message : 'Geçersiz baykuş ID.')],
      flags: 64,
    });
    return;
  }
  if (!resolvedOwl) {
    await interaction.reply({
      embeds: [failEmbed('Hata', 'Baykuş bulunamadı. `/owl owllist` ile kısa ID\'yi kontrol et.')],
      flags: 64,
    });
    return;
  }
  const owlId = resolvedOwl.id;

  await withLock(userId, 'setmain', async () => {
    if (await isPlayerBlockedForMainSwitch(ctx.prisma, ctx.redis, userId)) {
      throw new Error('Aktif PvP devam ederken main degistirilemez.');
    }
    await ctx.prisma.$transaction(async (tx: any) => {
      const player = await tx.player.findUnique({ where: { id: userId } });
      if (!player) throw new Error('Oyuncu bulunamadi.');
      if (player.lastHunt && Date.now() - player.lastHunt.getTime() < HUNT_COOLDOWN_MS) {
        throw new Error('Aktif av suresi devam ederken main degistirilemez.');
      }

      const target = await tx.owl.findUnique({ where: { id: owlId } });
      if (!target || target.ownerId !== userId) throw new Error('Gecersiz baykus secimi.');

      const allOwls  = await tx.owl.findMany({ where: { ownerId: userId }, select: { tier: true } });
      const totalTier = allOwls.reduce((sum: number, owl: { tier: number }) => sum + owl.tier, 0);
      const cost      = switchCost(totalTier);
      if (player.coins < cost) throw new Error(`Yetersiz coin. Gerekli: ${formatCoinLabel(cost)}`);

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

  // Cooldown sadece başarılı işlemden sonra set edilir
  await rehydratePlayerState(ctx.redis, ctx.prisma, userId);
  await armCooldown(ctx.redis, `cooldown:switch:${userId}`, SWITCH_COOLDOWN_MS);
  await fireQuest(ctx.prisma, userId, 'setmain', 1);
  await interaction.reply({ embeds: [successEmbed('Main Degisti', 'Yeni main baykus aktif. 🦉')], flags: 64 });
}

// ─── Prefix: owl setmain ──────────────────────────────────────────────────────

export async function runSetMainMessage(
  message: Message,
  args: string[],
  ctx: Parameters<CommandDefinition['execute']>[1],
  helpPrefix: string,
): Promise<void> {
  const userId = message.author.id;
  const owlInput = args[0];
  if (!owlInput) {
    const embed = new EmbedBuilder()
      .setColor(COLORS.PRIMARY)
      .setTitle('🔄 Setmain — Main Baykuş Değiştirme')
      .setDescription('> Envanterindeki başka bir baykuşu main olarak ayarla.')
      .addFields(
        { name: '📋 Kullanım', value: `\`${helpPrefix} setmain <kısa_id>\`\nID için \`${helpPrefix} owllist\``, inline: false },
        {
          name: `${COIN_EMOJI} Maliyet`,
          value: 'Maliyet = **1.000** + (tüm baykuşların tier toplamı × **400**)',
          inline: false,
        },
        {
          name: '⚠️ Kısıtlamalar',
          value: [
            '• Aktif **PvP** devam ederken değiştiremezsin.',
            '• Değiştirme sonrası **1 saat** cooldown uygulanır.',
            '• Değiştirme sonrası **10 dakika** boyunca hasar ve dodge cezası alırsın.',
          ].join('\n'),
          inline: false,
        },
      )
      .setFooter({ text: `Baykuş kısa ID için ${helpPrefix} owllist komutunu kullan.` });
    await message.reply({ embeds: [embed] });
    return;
  }

  const cooldown = await peekCooldown(ctx.redis, `cooldown:switch:${userId}`);
  if (cooldown.active) {
    await replyCooldownIfAllowed(
      message,
      `cooldown:switch:${userId}`,
      buildCooldownMessage(
        cooldown.remainingMs,
        'switch',
        message.member?.displayName ?? message.author.displayName ?? message.author.username,
      ),
    );
    return;
  }

  let resolvedOwl;
  try {
    resolvedOwl = await resolveOwlByInput(ctx.prisma, userId, owlInput);
  } catch (err) {
    await replyWithSuppression(
      message,
      `❌ ${err instanceof Error ? err.message : 'Geçersiz baykuş ID.'}`,
      SuppressionKeys.usage('setmain', 'invalid-id'),
    );
    return;
  }
  if (!resolvedOwl) {
    await replyWithSuppression(
      message,
      `❌ Baykuş bulunamadı. \`${helpPrefix} owllist\` ile kısa ID'yi kontrol et.`,
      SuppressionKeys.error('setmain-not-found'),
    );
    return;
  }
  const owlId = resolvedOwl.id;

  await withLock(userId, 'setmain', async () => {
    if (await isPlayerBlockedForMainSwitch(ctx.prisma, ctx.redis, userId)) {
      throw new Error('Aktif PvP devam ederken main degistirilemez.');
    }
    await ctx.prisma.$transaction(async (tx: any) => {
      const player = await tx.player.findUnique({ where: { id: userId } });
      if (!player) throw new Error('Oyuncu bulunamadi.');
      if (player.lastHunt && Date.now() - player.lastHunt.getTime() < HUNT_COOLDOWN_MS) {
        throw new Error('Aktif av suresi devam ederken main degistirilemez.');
      }

      const target = await tx.owl.findUnique({ where: { id: owlId } });
      if (!target || target.ownerId !== userId) throw new Error('Gecersiz baykus secimi.');

      const allOwls   = await tx.owl.findMany({ where: { ownerId: userId }, select: { tier: true } });
      const totalTier = allOwls.reduce((sum: number, owl: { tier: number }) => sum + owl.tier, 0);
      const cost      = switchCost(totalTier);
      if (player.coins < cost) throw new Error(`Yetersiz coin. Gerekli: ${formatCoinLabel(cost)}`);

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

  // Cooldown sadece başarılı işlemden sonra set edilir
  await rehydratePlayerState(ctx.redis, ctx.prisma, userId);
  await armCooldown(ctx.redis, `cooldown:switch:${userId}`, SWITCH_COOLDOWN_MS);
  await fireQuest(ctx.prisma, userId, 'setmain', 1);
  await message.reply(`✅ **Main Degisti** | Yeni main baykus aktif. 🦉`);
}

// ─── Slash: /owl owls ─────────────────────────────────────────────────────────

export async function runOwls(
  interaction: Parameters<CommandDefinition['execute']>[0],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  const userId = interaction.user.id;
  await fireQuest(ctx.prisma, userId, 'owls_view', 1);
  await reconcilePlayerOwlMoonTiers(ctx.prisma, userId);
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

  const helpPrefix = 'w';
  const parts = buildOwlsZooMessages({
    username,
    owls,
    helpPrefix,
  });
  await interaction.reply({ content: parts[0], flags: 64 });
  for (let i = 1; i < parts.length; i++) {
    await interaction.followUp({ content: parts[i], flags: 64 });
  }
}

// ─── Prefix: owl owls ─────────────────────────────────────────────────────────

export async function runOwlsMessage(
  message: Message,
  ctx: Parameters<CommandDefinition['execute']>[1],
  helpPrefix: string,
): Promise<void> {
  const userId = message.author.id;
  await fireQuest(ctx.prisma, userId, 'owls_view', 1);
  await reconcilePlayerOwlMoonTiers(ctx.prisma, userId);
  const owls: OwlRecord[] = await ctx.prisma.owl.findMany({
    where:   { ownerId: userId },
    orderBy: [{ isMain: 'desc' }, { tier: 'asc' }, { quality: 'asc' }],
  }) as OwlRecord[];

  const name = message.member?.displayName ?? message.author.username;

  if (owls.length === 0) {
    await message.reply(`🦉 **${name}** — Henüz hiç baykuşun yok.`);
    return;
  }

  const parts = buildOwlsZooMessages({
    username: name,
    owls,
    helpPrefix,
  });
  await message.reply(parts[0]!);
  if (message.channel.isSendable()) {
    for (let i = 1; i < parts.length; i++) {
      await message.channel.send(parts[i]!);
    }
  }
}

// ─── Slash: /owl owllist ──────────────────────────────────────────────────────

export async function runOwllist(
  interaction: Parameters<CommandDefinition['execute']>[0],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  const userId = interaction.user.id;
  const requestedPage = interaction.options.getInteger('sayfa') ?? 1;
  await reconcilePlayerOwlMoonTiers(ctx.prisma, userId);
  const owls = await ctx.prisma.owl.findMany({
    where:   { ownerId: userId },
    orderBy: [{ isMain: 'desc' }, { tier: 'asc' }, { quality: 'asc' }],
  });

  if (owls.length === 0) {
    await interaction.reply({
      content: '🦉 Henüz hiç baykuşun yok.',
      flags: 64,
    });
    return;
  }

  const helpPrefix = 'w';
  const username = interaction.member && 'displayName' in interaction.member
    ? (interaction.member as { displayName: string }).displayName
    : interaction.user.username;
  const totalPages = getOwllistPageCount(owls.length);
  const page = parseOwllistPage(String(requestedPage), totalPages);
  await replyOwllistPaginated(
    async (payload) => {
      await interaction.reply({ ...payload, flags: 64 });
      return interaction.fetchReply();
    },
    userId,
    {
      owls,
      helpPrefix,
      ownerDisplayName: username,
    },
    page,
  );
}

// ─── Prefix: owl owllist ──────────────────────────────────────────────────────

export async function runOwllistMessage(
  message: Message,
  args: string[],
  ctx: Parameters<CommandDefinition['execute']>[1],
  helpPrefix: string,
): Promise<void> {
  const userId = message.author.id;
  await reconcilePlayerOwlMoonTiers(ctx.prisma, userId);
  const owls: OwlRecord[] = await ctx.prisma.owl.findMany({
    where:   { ownerId: userId },
    orderBy: [{ isMain: 'desc' }, { tier: 'asc' }, { quality: 'asc' }],
  }) as OwlRecord[];

  const name = message.member?.displayName ?? message.author.username;

  if (owls.length === 0) {
    await message.reply('🦉 Henüz hiç baykuşun yok.');
    return;
  }

  const totalPages = getOwllistPageCount(owls.length);
  const page = parseOwllistPage(args[0], totalPages);
  await replyOwllistPaginated(
    (payload) => message.reply(payload),
    userId,
    {
      owls,
      helpPrefix,
      ownerDisplayName: name,
    },
    page,
  );
}

// ─── Prefix: owl name / Slash: /owl rename ────────────────────────────────────

async function applyOwlNickname(
  ctx: Parameters<CommandDefinition['execute']>[1],
  userId: string,
  owlInput: string,
  rawName: string,
  ownerDisplayName: string,
): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  let resolvedOwl;
  try {
    resolvedOwl = await resolveOwlByInput(ctx.prisma, userId, owlInput);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Geçersiz baykuş ID.' };
  }
  if (!resolvedOwl) {
    return { ok: false, message: 'Baykuş bulunamadı. `owllist` ile kısa ID\'yi kontrol et.' };
  }

  if (isOwlNicknameClearCommand(rawName)) {
    await ctx.prisma.owl.update({
      where: { id: resolvedOwl.id },
      data: { nickname: null },
    });
    await invalidatePlayerCache(ctx.redis, userId);
    if (resolvedOwl.isMain) {
      await rehydratePlayerState(ctx.redis, ctx.prisma, userId);
    }
    return {
      ok: true,
      message: `✅ Takma ad kaldırıldı. Baykuşun yine **${ownerDisplayName}** olarak görünüyor.`,
    };
  }

  const validation = validateOwlNickname(rawName);
  if (!validation.ok) {
    return { ok: false, message: validation.message };
  }

  await ctx.prisma.owl.update({
    where: { id: resolvedOwl.id },
    data: { nickname: validation.value },
  });
  await invalidatePlayerCache(ctx.redis, userId);
  if (resolvedOwl.isMain) {
    await rehydratePlayerState(ctx.redis, ctx.prisma, userId);
  }

  await fireQuest(ctx.prisma, userId, 'owl_name', 1);
  return {
    ok: true,
    message: `✅ **${resolvedOwl.species}** artık **${validation.value}** takma adıyla anılıyor.`,
  };
}

export async function runOwlRenameSlash(
  interaction: Parameters<CommandDefinition['execute']>[0],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  const userId = interaction.user.id;
  const owlInput = interaction.options.getString('baykus', true);
  const rawName = interaction.options.getString('isim', true);

  const ownerDisplayName = resolveDiscordDisplayName(
    interaction.member && 'displayName' in interaction.member
      ? (interaction.member as { displayName: string })
      : null,
    interaction.user,
  );

  const result = await applyOwlNickname(ctx, userId, owlInput, rawName, ownerDisplayName);
  if (!result.ok) {
    await interaction.reply({ embeds: [failEmbed('Hata', result.message)], flags: 64 });
    return;
  }
  await interaction.reply({ content: result.message, flags: 64 });
}

export async function runOwlRenameMessage(
  message: Message,
  args: string[],
  ctx: Parameters<CommandDefinition['execute']>[1],
  helpPrefix: string,
): Promise<void> {
  if (args.length === 0) {
    await message.reply(
      `❌ Kullanım: \`${helpPrefix} owl name <isim>\` (main baykuş) · ` +
      `\`${helpPrefix} owl name <id> <isim>\` · \`${helpPrefix} owl name clear\` veya \`${helpPrefix} owl name <id> clear\``,
    );
    return;
  }

  let owlInput: string;
  let rawName: string;

  if (args.length === 1) {
    const mainOwl = await ctx.prisma.owl.findFirst({
      where: { ownerId: message.author.id, isMain: true },
    });
    if (!mainOwl) {
      await message.reply({ embeds: [failEmbed('Hata', 'Main baykuş bulunamadı.')] });
      return;
    }
    owlInput = mainOwl.id;
    rawName = args[0]!;
  } else {
    owlInput = args[0]!;
    rawName = args.slice(1).join(' ');
  }

  const ownerDisplayName = resolveDiscordDisplayName(message.member, message.author);
  const result = await applyOwlNickname(ctx, message.author.id, owlInput, rawName, ownerDisplayName);
  if (!result.ok) {
    await message.reply({ embeds: [failEmbed('Hata', result.message)] });
    return;
  }
  await message.reply(result.message);
}
