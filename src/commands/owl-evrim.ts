/**
 * owl-evrim.ts — /owl evrim · w evrim
 */

import type { Message } from 'discord.js';
import type { CommandDefinition } from '../types';
import { getPlayerBundle } from '../utils/player-cache';
import { calcOwlStatSumPower, reconcilePlayerOwlMoonTiers } from '../systems/owl-moon-evolution';
import { getMoonTierProgress } from '../config/owl-moon-tier';
import { buildEvrimMessage } from '../utils/evrim-ux';
import { getOwlPrimaryName } from '../utils/owl-display';
import { resolveDiscordDisplayName } from '../utils/player-display-name';
import { failEmbed } from '../utils/embed';
import { safeReply } from '../utils/safe-reply';
import { getGuildPrefix } from '../utils/prefix';

export async function runEvrim(
  interaction: Parameters<CommandDefinition['execute']>[0],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  await reconcilePlayerOwlMoonTiers(ctx.prisma, interaction.user.id);
  const bundle = await getPlayerBundle(ctx.redis, ctx.prisma, interaction.user.id);
  const owl = bundle?.mainOwl;
  if (!owl) {
    await interaction.reply({ embeds: [failEmbed('Hata', 'Ana baykuş bulunamadı.')], flags: 64 });
    return;
  }

  const ownerDisplayName = resolveDiscordDisplayName(
    interaction.member && 'displayName' in interaction.member
      ? (interaction.member as { displayName: string })
      : null,
    interaction.user,
  );

  const power = calcOwlStatSumPower(owl);
  const progress = getMoonTierProgress(power);
  const prefix = interaction.guildId
    ? (await getGuildPrefix(ctx.redis, interaction.guildId)) || 'w'
    : 'w';

  await interaction.reply({
    content: buildEvrimMessage({
      displayName: getOwlPrimaryName(owl, ownerDisplayName),
      speciesTier: owl.tier,
      progress,
    }, prefix),
    flags: 64,
  });
}

export async function runEvrimMessage(
  message: Message,
  ctx: Parameters<CommandDefinition['execute']>[1],
  helpPrefix = 'w',
): Promise<void> {
  await reconcilePlayerOwlMoonTiers(ctx.prisma, message.author.id);
  const bundle = await getPlayerBundle(ctx.redis, ctx.prisma, message.author.id);
  const owl = bundle?.mainOwl;
  if (!owl) {
    await safeReply(message, '❌ **Hata** | Ana baykuş bulunamadı.');
    return;
  }

  const ownerDisplayName = resolveDiscordDisplayName(message.member, message.author);
  const power = calcOwlStatSumPower(owl);
  const progress = getMoonTierProgress(power);

  await safeReply(message, buildEvrimMessage({
    displayName: getOwlPrimaryName(owl, ownerDisplayName),
    speciesTier: owl.tier,
    progress,
  }, helpPrefix));
}
