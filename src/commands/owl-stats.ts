/**
 * owl-stats.ts — /owl stats komutu
 */

import { buildOwlStatsEmbed } from '../utils/stats-ux';
import type { OwlStatsData, PlayerStatsData } from '../utils/stats-ux';
import { failEmbed } from '../utils/embed';
import type { CommandDefinition } from '../types';
import type { Message } from 'discord.js';
import { resolveDiscordDisplayName } from '../utils/player-display-name';
import { getPlayerBundle } from '../utils/player-cache';
import { safeReply } from '../utils/safe-reply';
import { notifyInflightBusy } from '../utils/guarded-discord';
import { acquireInFlightAction, releaseInFlightAction, SuppressionKeys } from '../utils/response-suppression';
import { embedWithLostFooterIfNeeded } from '../utils/flow-helpers';
import { formatCosmeticTitleLine, grantCosmeticTitle, listCosmeticTitleLabels } from '../systems/cosmetics';
import { resolveOwlMoonTierFromStats } from '../systems/owl-moon-evolution';

// ─── Slash: /owl stats ────────────────────────────────────────────────────────

export async function runStats(
  interaction: Parameters<CommandDefinition['execute']>[0],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  const deep = interaction.options.getBoolean('deep') ?? false;

  const bundle = await getPlayerBundle(ctx.redis, ctx.prisma, interaction.user.id);
  const player = bundle?.player;
  const owl = bundle?.mainOwl;
  if (!player || !owl) {
    await interaction.reply({ embeds: [failEmbed('Hata', 'Ana baykuş bulunamadı.')], flags: 64 });
    return;
  }

  const owlData: OwlStatsData = {
    species:    owl.species,
    nickname:   owl.nickname ?? null,
    tier:       owl.tier,
    quality:    owl.quality,
    hp:         owl.hp,
    hpMax:      owl.hpMax,
    staminaCur: owl.staminaCur,
    statGaga:   owl.statGaga,
    statGoz:    owl.statGoz,
    statKulak:  owl.statKulak,
    statKanat:  owl.statKanat,
    statPence:  owl.statPence,
    statGagaBase: owl.statGagaBase,
    statGozBase: owl.statGozBase,
    statKulakBase: owl.statKulakBase,
    statKanatBase: owl.statKanatBase,
    statPenceBase: owl.statPenceBase,
    statGagaTrained: owl.statGagaTrained,
    statGozTrained: owl.statGozTrained,
    statKulakTrained: owl.statKulakTrained,
    statKanatTrained: owl.statKanatTrained,
    statPenceTrained: owl.statPenceTrained,
    bond:       owl.bond,
    isMain:     owl.isMain,
  };
  if (resolveOwlMoonTierFromStats(owl) >= 3) {
    await grantCosmeticTitle(ctx.redis, interaction.user.id, 'ay').catch(() => undefined);
  }
  const titles = await listCosmeticTitleLabels(ctx.redis, interaction.user.id).catch(() => [] as string[]);
  const playerData: PlayerStatsData = {
    level: player.level,
    huntStreak: player.huntComboStreak,
    titleLine: formatCosmeticTitleLine(titles) ?? undefined,
  };

  const ownerDisplayName = resolveDiscordDisplayName(
    interaction.member && 'displayName' in interaction.member
      ? (interaction.member as { displayName: string })
      : null,
    interaction.user,
  );

  let embed = buildOwlStatsEmbed(owlData, playerData, deep, ownerDisplayName);
  embed = await embedWithLostFooterIfNeeded(ctx.redis, interaction.user.id, 'stats', embed);

  await interaction.reply({ embeds: [embed], flags: 64 });
}

// ─── Prefix: owl stats ────────────────────────────────────────────────────────

export async function runStatsMessage(
  message: Message,
  args: string[],
  ctx: Parameters<CommandDefinition['execute']>[1],
  helpPrefix = 'w',
): Promise<void> {
  const deep = (args[0] ?? '').toLowerCase() === 'deep';
  const gate = {
    userId: message.author.id,
    guildId: message.guildId,
    key: SuppressionKeys.state('stats-inflight'),
  };
  if (!acquireInFlightAction(gate)) {
    const name = message.member?.displayName ?? message.author.displayName ?? message.author.username;
    await notifyInflightBusy(message, name, SuppressionKeys.state('stats-inflight-busy'), {
      redis: ctx.redis,
      command: 'stats',
    });
    return;
  }
  const sent = await safeReply(message, '📊 **İstatistikler yükleniyor...**');
  try {
    if (!sent) return;

    const bundle = await getPlayerBundle(ctx.redis, ctx.prisma, message.author.id);
    const player = bundle?.player;
    const owl = bundle?.mainOwl;
    if (!player || !owl) {
      await sent.edit('❌ **Hata** | Ana baykuş bulunamadı.').catch(() => null);
      return;
    }

    const owlData: OwlStatsData = {
      species:    owl.species,
      nickname:   owl.nickname ?? null,
      tier:       owl.tier,
      quality:    owl.quality,
      hp:         owl.hp,
      hpMax:      owl.hpMax,
      staminaCur: owl.staminaCur,
      statGaga:   owl.statGaga,
      statGoz:    owl.statGoz,
      statKulak:  owl.statKulak,
      statKanat:  owl.statKanat,
      statPence:  owl.statPence,
      statGagaBase: owl.statGagaBase,
      statGozBase: owl.statGozBase,
      statKulakBase: owl.statKulakBase,
      statKanatBase: owl.statKanatBase,
      statPenceBase: owl.statPenceBase,
      statGagaTrained: owl.statGagaTrained,
      statGozTrained: owl.statGozTrained,
      statKulakTrained: owl.statKulakTrained,
      statKanatTrained: owl.statKanatTrained,
      statPenceTrained: owl.statPenceTrained,
      bond:       owl.bond,
      isMain:     owl.isMain,
    };
    if (resolveOwlMoonTierFromStats(owl) >= 3) {
      await grantCosmeticTitle(ctx.redis, message.author.id, 'ay').catch(() => undefined);
    }
    const titles = await listCosmeticTitleLabels(ctx.redis, message.author.id).catch(() => [] as string[]);
    const playerData: PlayerStatsData = {
      level: player.level,
      huntStreak: player.huntComboStreak,
      titleLine: formatCosmeticTitleLine(titles) ?? undefined,
    };

    const ownerDisplayName = resolveDiscordDisplayName(message.member, message.author);

    let embed = buildOwlStatsEmbed(owlData, playerData, deep, ownerDisplayName, helpPrefix);
    embed = await embedWithLostFooterIfNeeded(ctx.redis, message.author.id, 'stats', embed);

    await sent.edit({ embeds: [embed] }).catch(() =>
      safeReply(message, { embeds: [embed] }),
    );
  } finally {
    releaseInFlightAction(gate);
  }
}
