// ============================================================
// leaderboard.ts — owl top / lb prefix komutu
// Butonlu kategori navigasyonu, oyuncu konumu, sezon bilgisi
// ============================================================

import {
  ComponentType,
  type Message,
} from 'discord.js';
import type { CommandContext } from '../types';
import { getLeaderboard, type LeaderboardCategory } from '../systems/leaderboard';
import { buildLeaderboardEmbed, buildCategoryRow } from '../utils/leaderboard-ux';
import { ensureRegisteredForMessage } from '../systems/onboarding';
import { fireQuest } from '../systems/quest-tracker';

const COLLECTOR_TTL = 30_000;

export async function handleTopTextCommand(
  message: Message,
  parts: string[],
  ctx: CommandContext,
): Promise<void> {
  const ready = await ensureRegisteredForMessage(message, ctx);
  if (!ready) return;
  await fireQuest(ctx.prisma, message.author.id, 'lb_check', 1);

  const catArg = (parts[0] ?? '').toLowerCase();
  const startCategory = resolveCategoryAlias(catArg) ?? 'power';

  let current: LeaderboardCategory = startCategory;

  const textLbOpts = {
    viewerId: message.author.id,
    scope: 'global' as const,
    guildId: message.guildId,
    fresh: true as const,
  };

  const result = await getLeaderboard(ctx.prisma, ctx.redis, current, textLbOpts);
  const embed = buildLeaderboardEmbed(result, message.author.id);
  const row = buildCategoryRow(current);

  const sent = await message.reply({ embeds: [embed], components: [row] });

  const collector = sent.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: COLLECTOR_TTL,
  });

  collector.on('collect', async (btn) => {
    const newCategory = btn.customId.replace('lb_', '') as LeaderboardCategory;
    current = newCategory;

    await btn.deferUpdate();
    const newResult = await getLeaderboard(ctx.prisma, ctx.redis, current, {
      ...textLbOpts,
      viewerId: btn.user.id,
    });
    const newEmbed = buildLeaderboardEmbed(newResult, btn.user.id);
    const newRow = buildCategoryRow(current);
    await sent.edit({ embeds: [newEmbed], components: [newRow] }).catch(() => null);
  });

  collector.on('end', async () => {
    const disabledRow = buildCategoryRow(current, true);
    await sent.edit({ components: [disabledRow] }).catch(() => null);
  });
}

function resolveCategoryAlias(input: string): LeaderboardCategory | null {
  const map: Record<string, LeaderboardCategory> = {
    power: 'power', guc: 'power', güç: 'power',
    hunt: 'hunt', av: 'hunt', avi: 'hunt',
    arena: 'arena', pvp: 'arena', duello: 'arena', savas: 'arena', savaş: 'arena',
    wealth: 'wealth', servet: 'wealth', coin: 'wealth', para: 'wealth', altin: 'wealth', altın: 'wealth',
  };
  return map[input] ?? null;
}
