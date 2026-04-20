// ============================================================
// leaderboard.ts — /lb ve owl top komutu
// Butonlu kategori navigasyonu, oyuncu konumu, sezon bilgisi
// ============================================================

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  SlashCommandBuilder,
  type Message,
} from 'discord.js';
import type { CommandDefinition, CommandContext } from '../types';
import { failEmbed } from '../utils/embed';
import { getLeaderboard, type LeaderboardCategory } from '../systems/leaderboard';
import { buildLeaderboardEmbed, buildCategoryRow } from '../utils/leaderboard-ux';
import { ensureRegisteredForInteraction, ensureRegisteredForMessage } from '../systems/onboarding';

// Buton collector suresi (ms)
const COLLECTOR_TTL = 90_000;

// ── Slash Komutu ──────────────────────────────────────────────────────────────

const data = new SlashCommandBuilder()
  .setName('lb')
  .setDescription('Liderboard siralamalarini goster')
  .addStringOption((opt) =>
    opt
      .setName('kategori')
      .setDescription('Hangi siralama? (varsayilan: Guc)')
      .setRequired(false)
      .addChoices(
        { name: '🏆 Güç Sıralaması',   value: 'power'  },
        { name: '🎯 Av Ustası',         value: 'hunt'   },
        { name: '💎 Hazine Avcısı',     value: 'relic'  },
        { name: '⚔️ Arena Hakimi',      value: 'arena'  },
        { name: '💰 Servet Sıralaması', value: 'wealth' },
      ),
  );

async function execute(
  interaction: Parameters<CommandDefinition['execute']>[0],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  try {
    const ready = await ensureRegisteredForInteraction(interaction, ctx);
    if (!ready) return;

    const startCategory = (interaction.options.getString('kategori') ?? 'power') as LeaderboardCategory;

    await interaction.deferReply();

    let current = startCategory;
    const result = await getLeaderboard(ctx.prisma, ctx.redis, current, interaction.user.id);
    const embed = buildLeaderboardEmbed(result, interaction.user.id);
    const row = buildCategoryRow(current);

    await interaction.editReply({ embeds: [embed], components: [row] });

    const msg = await interaction.fetchReply();
    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: COLLECTOR_TTL,
    });

    collector.on('collect', async (btn) => {
      // Herkes kullanabilir (public leaderboard)
      const newCategory = btn.customId.replace('lb_', '') as LeaderboardCategory;
      if (newCategory === current) {
        await btn.deferUpdate();
        return;
      }
      current = newCategory;

      await btn.deferUpdate();
      const newResult = await getLeaderboard(ctx.prisma, ctx.redis, current, btn.user.id);
      const newEmbed = buildLeaderboardEmbed(newResult, btn.user.id);
      const newRow = buildCategoryRow(current);
      await interaction.editReply({ embeds: [newEmbed], components: [newRow] }).catch(() => null);
    });

    collector.on('end', async () => {
      // Butonlari devre disi birak
      const disabledRow = buildCategoryRow(current, true);
      await interaction.editReply({ components: [disabledRow] }).catch(() => null);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Bir seyler ters gitti.';
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ embeds: [failEmbed('Hata', message)] });
    } else {
      await interaction.reply({ embeds: [failEmbed('Hata', message)], flags: 64 });
    }
  }
}

export default { data, execute } satisfies CommandDefinition;

// ── Text Komutu Handler (owl top) ─────────────────────────────────────────────

/**
 * "owl top [kategori]" text komutunu isler.
 * index.ts'ten cagrilir.
 */
export async function handleTopTextCommand(
  message: Message,
  parts: string[],
  ctx: CommandContext,
): Promise<void> {
  const ready = await ensureRegisteredForMessage(message, ctx);
  if (!ready) return;

  // Kategori argumani: "owl top av", "owl top pvp" vb.
  const catArg = (parts[0] ?? '').toLowerCase();
  const startCategory = resolveCategoryAlias(catArg) ?? 'power';

  let current: LeaderboardCategory = startCategory;

  const result = await getLeaderboard(ctx.prisma, ctx.redis, current, message.author.id);
  const embed = buildLeaderboardEmbed(result, message.author.id);
  const row = buildCategoryRow(current);

  const sent = await message.reply({ embeds: [embed], components: [row] });

  const collector = sent.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: COLLECTOR_TTL,
  });

  collector.on('collect', async (btn) => {
    const newCategory = btn.customId.replace('lb_', '') as LeaderboardCategory;
    if (newCategory === current) {
      await btn.deferUpdate();
      return;
    }
    current = newCategory;

    await btn.deferUpdate();
    const newResult = await getLeaderboard(ctx.prisma, ctx.redis, current, btn.user.id);
    const newEmbed = buildLeaderboardEmbed(newResult, btn.user.id);
    const newRow = buildCategoryRow(current);
    await sent.edit({ embeds: [newEmbed], components: [newRow] }).catch(() => null);
  });

  collector.on('end', async () => {
    const disabledRow = buildCategoryRow(current, true);
    await sent.edit({ components: [disabledRow] }).catch(() => null);
  });
}

// ── Kategori Alias Cozucu ─────────────────────────────────────────────────────

function resolveCategoryAlias(input: string): LeaderboardCategory | null {
  const map: Record<string, LeaderboardCategory> = {
    // Güç
    power: 'power', guc: 'power', güç: 'power', guc: 'power',
    // Av
    hunt: 'hunt', av: 'hunt', avi: 'hunt',
    // Nadir
    relic: 'relic', nadir: 'relic', hazine: 'relic', rare: 'relic',
    // Arena
    arena: 'arena', pvp: 'arena', duello: 'arena', savas: 'arena', savaş: 'arena',
    // Servet
    wealth: 'wealth', servet: 'wealth', coin: 'wealth', para: 'wealth', altin: 'wealth', altın: 'wealth',
  };
  return map[input] ?? null;
}
