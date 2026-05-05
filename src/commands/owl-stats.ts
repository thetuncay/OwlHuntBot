/**
 * owl-stats.ts — /owl stats komutu
 */

import { buildOwlStatsEmbed } from '../utils/stats-ux';
import type { OwlStatsData, PlayerStatsData } from '../utils/stats-ux';
import { failEmbed } from '../utils/embed';
import type { CommandDefinition } from '../types';
import type { Message } from 'discord.js';
import { getPlayerBundle } from '../utils/player-cache';

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
    await interaction.reply({ embeds: [failEmbed('Hata', 'Main baykus bulunamadi.')], flags: 64 });
    return;
  }

  const owlData: OwlStatsData = {
    species:    owl.species,
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
    bond:       owl.bond,
    isMain:     owl.isMain,
  };
  const playerData: PlayerStatsData = { level: player.level };

  await interaction.reply({ embeds: [buildOwlStatsEmbed(owlData, playerData, deep)], flags: 64 });
}

// ─── Prefix: owl stats ────────────────────────────────────────────────────────

export async function runStatsMessage(
  message: Message,
  args: string[],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  const deep = (args[0] ?? '').toLowerCase() === 'deep';

  const bundle = await getPlayerBundle(ctx.redis, ctx.prisma, message.author.id);
  const player = bundle?.player;
  const owl = bundle?.mainOwl;
  if (!player || !owl) {
    await message.reply(`❌ **Hata** | Main baykus bulunamadi.`);
    return;
  }

  const owlData: OwlStatsData = {
    species:    owl.species,
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
    bond:       owl.bond,
    isMain:     owl.isMain,
  };
  const playerData: PlayerStatsData = { level: player.level };

  await message.reply({ embeds: [buildOwlStatsEmbed(owlData, playerData, deep)] });
}
