/**
 * owl-upgrade.ts — /owl upgrade komutu
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  type Message,
} from 'discord.js';
import { armCooldown, peekCooldown } from '../middleware/cooldown-manager';
import { attemptUpgrade, getUpgradePreview } from '../systems/upgrade';
import {
  buildUpgradePanel,
  buildUpgradeResult,
  buildUpgradeCancel,
  buildUpgradeOverview,
  buildDepBlockedEmbed,
  buildUpgradeBlockedEmbed,
  type UpgradeOverviewOwlStats,
} from '../utils/upgrade-ux';
import type { CachedOwlData } from '../utils/player-cache';
import type { UpgradePanelData } from '../utils/upgrade-ux';
import { failEmbed } from '../utils/embed';
import type { CommandDefinition, OwlStatKey } from '../types';
import { UPGRADE_COOLDOWN_MS, UPGRADE_STATS } from './owl-utils';
import { UPGRADE_BULK_MAX } from '../config';
import { planBulkUpgrade, clampUpgradeBulkSteps } from '../utils/upgrade-bulk';
import { getPlayerBundle, invalidatePlayerCache } from '../utils/player-cache';
import { getBaseStat, getEffectiveStats, getTrainedStats } from '../utils/owl-stats';
import { getOwlPrimaryName } from '../utils/owl-display';
import { resolveDiscordDisplayName } from '../utils/player-display-name';
import { buildCooldownMessage } from '../utils/command-error';
import {
  interactionReplyWithSuppression,
  replyCooldownIfAllowed,
  replyWithSuppression,
  SuppressionKeys,
} from '../utils/guarded-discord';
import { buildMoonEvolutionFollowUp } from '../utils/owl-moon-ux';
import { getGuildPrefix } from '../utils/prefix';

function buildOverviewStats(owl: CachedOwlData): UpgradeOverviewOwlStats {
  const effective = getEffectiveStats(owl);
  const trained = getTrainedStats(owl);
  return {
    gaga:  { effective: effective.gaga,  trained: trained.gaga },
    pence: { effective: effective.pence, trained: trained.pence },
    goz:   { effective: effective.goz,   trained: trained.goz },
    kulak: { effective: effective.kulak, trained: trained.kulak },
    kanat: { effective: effective.kanat, trained: trained.kanat },
  };
}

function buildUpgradePanelData(
  main: CachedOwlData,
  player: { level: number },
  stat: OwlStatKey,
  ownerDisplayName: string | null | undefined,
  preview: Awaited<ReturnType<typeof getUpgradePreview>>,
  bulkPlan?: ReturnType<typeof planBulkUpgrade>,
): UpgradePanelData {
  const effective = getEffectiveStats(main);
  const trained = getTrainedStats(main);
  return {
    owlName:     getOwlPrimaryName(main, ownerDisplayName),
    owlQuality:  main.quality,
    stat,
    statTrained:   trained[stat],
    statEffective: effective[stat],
    coinCost:        preview.coinCost,
    coinDiscountPct: preview.coinDiscountPct,
    materialCost:    preview.materialCost,
    materialName:    preview.materialName,
    allStatsEffective: effective,
    bulkPlan,
    depCheck: preview.depCheck,
  };
}

// ─── Slash: /owl upgrade ──────────────────────────────────────────────────────

export async function runUpgrade(
  interaction: Parameters<CommandDefinition['execute']>[0],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  const stat = interaction.options.getString('stat', true) as OwlStatKey;

  const cooldownKey = `cooldown:upgrade:${interaction.user.id}`;
  const cooldown = await peekCooldown(ctx.redis, cooldownKey);
  if (cooldown.active) {
    await interactionReplyWithSuppression(
      interaction,
      {
        content: buildCooldownMessage(
          cooldown.remainingMs,
          'upgrade',
          interaction.member && 'displayName' in interaction.member
            ? (interaction.member as { displayName: string }).displayName
            : interaction.user.username,
        ),
        flags: 64,
      },
      SuppressionKeys.cooldown(cooldownKey),
    );
    return;
  }

  const panelLockKey = `upgrade:panel:${interaction.user.id}`;
  const panelActive  = await ctx.redis.get(panelLockKey);
  if (panelActive) {
    await interaction.reply({
      content: `⚠️ Zaten açık bir upgrade panelin var. Önce onu onayla veya iptal et.`,
      flags: 64,
    });
    setTimeout(() => interaction.deleteReply().catch(() => null), 3000);
    return;
  }
  await ctx.redis.set(panelLockKey, '1', 'EX', 32);

  // Cache'den veya DB'den player + main owl çek
  const bundle = await getPlayerBundle(ctx.redis, ctx.prisma, interaction.user.id);
  const player = bundle?.player;
  const main = bundle?.mainOwl;
  if (!main || !player) {
    await ctx.redis.del(panelLockKey);
    await interaction.reply({ embeds: [failEmbed('Hata', 'Ana baykuş bulunamadı.')], flags: 64 });
    return;
  }

  const ownerDisplayName = resolveDiscordDisplayName(
    interaction.member && 'displayName' in interaction.member
      ? (interaction.member as { displayName: string })
      : null,
    interaction.user,
  );

  const preview = await getUpgradePreview(ctx.prisma, interaction.user.id, main.id, stat, [], ctx.redis);
  const panelData = buildUpgradePanelData(main, player, stat, ownerDisplayName, preview);
  const helpPrefix = interaction.guildId
    ? (await getGuildPrefix(ctx.redis, interaction.guildId)) || 'w'
    : 'w';

  const depBlocked = !preview.depCheck.ok && preview.depCheck.dependsOn !== null;
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`up_ok:${main.id}:${stat}`)
      .setLabel(depBlocked ? 'Kilitli' : 'Devam et')
      .setEmoji(depBlocked ? '🔒' : '⚡')
      .setStyle(depBlocked ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(depBlocked),
    new ButtonBuilder().setCustomId('up_cancel').setLabel('İptal').setEmoji('🚫').setStyle(ButtonStyle.Secondary),
  );

  await interaction.reply({ embeds: [buildUpgradePanel(panelData, helpPrefix)], components: [row], flags: 64 });

  const msg = await interaction.fetchReply();
  const collector = msg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 30_000,
  });

  collector.on('collect', async (i) => {
    if (i.user.id !== interaction.user.id) {
      await i.reply({ content: '❌ Bu buton sana ait değil.', flags: 64 });
      return;
    }
    if (i.customId === 'up_cancel') {
      await ctx.redis.del(panelLockKey);
      await i.update({ embeds: [buildUpgradeCancel()], components: [] });
      collector.stop();
      return;
    }
    try {
      const result = await attemptUpgrade(ctx.prisma, interaction.user.id, main.id, stat, [], ctx.redis);
      await Promise.all([
        armCooldown(ctx.redis, cooldownKey, UPGRADE_COOLDOWN_MS),
        ctx.redis.del(panelLockKey),
        invalidatePlayerCache(ctx.redis, interaction.user.id),
      ]);
      const baseVal = getBaseStat(main, stat);
      await i.update({
        embeds: [buildUpgradeResult({
          stat,
          oldTrained: result.oldValue,
          newTrained: result.newValue,
          effectiveOld: baseVal + result.oldValue,
          effectiveNew: baseVal + result.newValue,
        })],
        components: [],
      }).catch(() => null);
      if (result.evolution) {
        const helpPrefix = interaction.guildId
          ? (await getGuildPrefix(ctx.redis, interaction.guildId)) || 'w'
          : 'w';
        await interaction.followUp(buildMoonEvolutionFollowUp(result.evolution, helpPrefix)).catch(() => null);
      }
    } catch (error) {
      await ctx.redis.del(panelLockKey);
      const errMsg = error instanceof Error ? error.message : 'Bir hata oluştu.';
      const depEmbed = buildUpgradeBlockedEmbed(errMsg, helpPrefix);
      if (depEmbed) {
        await i.update({ embeds: [depEmbed], components: [] }).catch(() => null);
      } else {
        await i.update({ content: `❌ ${errMsg}`, embeds: [], components: [] }).catch(() => null);
      }
    }
    collector.stop();
  });

  collector.on('end', async (_, reason) => {
    if (reason === 'time') {
      await ctx.redis.del(panelLockKey);
      await interaction.editReply({ embeds: [buildUpgradeCancel()], components: [] }).catch(() => null);
    }
  });
}

// ─── Prefix: owl upgrade ──────────────────────────────────────────────────────

export async function runUpgradeMessage(
  message: Message,
  args: string[],
  ctx: Parameters<CommandDefinition['execute']>[1],
  helpPrefix: string,
): Promise<void> {
  const statRaw = (args[0] ?? '').toLowerCase();
  const STAT_ALIAS: Record<string, OwlStatKey> = {
    gaga: 'gaga', gag: 'gaga',
    goz: 'goz', göz: 'goz', eye: 'goz',
    kulak: 'kulak', ear: 'kulak',
    kanat: 'kanat', wing: 'kanat',
    pence: 'pence', pençe: 'pence', claw: 'pence',
  };
  const stat = STAT_ALIAS[statRaw] as OwlStatKey | undefined;
  const qtyRaw = (args[1] ?? '1').toLowerCase();
  const bulkCount = qtyRaw === 'all'
    ? UPGRADE_BULK_MAX
    : clampUpgradeBulkSteps(parseInt(qtyRaw, 10) || 1);

  if (!stat || !UPGRADE_STATS.includes(stat)) {
    // Oyuncu stat bilgisini çek — overview'da mevcut seviyeleri göster
    const overviewBundle = await getPlayerBundle(ctx.redis, ctx.prisma, message.author.id);
    const overviewOwl = overviewBundle?.mainOwl;
    const owlStats = overviewOwl ? buildOverviewStats(overviewOwl) : undefined;
    await message.reply({ embeds: [buildUpgradeOverview(helpPrefix, owlStats)] });
    return;
  }

  const upgradeCooldownKey = `cooldown:upgrade:${message.author.id}`;
  const cooldown = await peekCooldown(ctx.redis, upgradeCooldownKey);
  if (cooldown.active) {
    await replyCooldownIfAllowed(
      message,
      upgradeCooldownKey,
      buildCooldownMessage(
        cooldown.remainingMs,
        'upgrade',
        message.member?.displayName ?? message.author.displayName ?? message.author.username,
      ),
    );
    return;
  }

  const upgradePanelKey    = `upgrade:panel:${message.author.id}`;
  const upgradePanelActive = await ctx.redis.get(upgradePanelKey);
  if (upgradePanelActive) {
    const sent = await replyWithSuppression(
      message,
      `⚠️ Zaten açık bir upgrade panelin var. Önce onu onayla veya iptal et.`,
      SuppressionKeys.state('upgrade-panel-open'),
    );
    if (!sent) return;
    setTimeout(() => sent.delete().catch(() => null), 3000);
    return;
  }
  await ctx.redis.set(upgradePanelKey, '1', 'EX', 32);

  // Cache'den veya DB'den player + main owl çek
  const msgBundle = await getPlayerBundle(ctx.redis, ctx.prisma, message.author.id);
  const player = msgBundle?.player;
  const main = msgBundle?.mainOwl;
  if (!main || !player) {
    await ctx.redis.del(upgradePanelKey);
    await replyWithSuppression(
      message,
      `❌ **Hata** | Ana baykuş bulunamadı.`,
      SuppressionKeys.pvp('no-main'),
    );
    return;
  }

  const ownerDisplayName = resolveDiscordDisplayName(message.member, message.author);

  const preview = await getUpgradePreview(ctx.prisma, message.author.id, main.id, stat, [], ctx.redis);
  const trainedStats = getTrainedStats(main);
  const effectiveStats = getEffectiveStats(main);
  const bulkPlan = planBulkUpgrade({
    stat,
    requestedSteps: bulkCount,
    coins: preview.playerCoins,
    materialQty: preview.materialHave,
    discountFraction: preview.discountFraction,
    trainedStats,
    effectiveStats,
  });
  const panelData = buildUpgradePanelData(main, player, stat, ownerDisplayName, preview, bulkPlan);

  const depBlocked = !preview.depCheck.ok && preview.depCheck.dependsOn !== null;
  const canBulk = !depBlocked && bulkPlan.affordableSteps > 0;
  const confirmSteps = canBulk ? bulkPlan.affordableSteps : 0;
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`up_ok:${main.id}:${stat}`)
      .setLabel(
        depBlocked ? 'Kilitli' :
        confirmSteps > 1 ? `Yükselt x${confirmSteps}` :
        confirmSteps === 1 ? 'Devam et' :
        'Yetersiz',
      )
      .setEmoji(depBlocked || confirmSteps === 0 ? '🔒' : '⚡')
      .setStyle(depBlocked || confirmSteps === 0 ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(depBlocked || confirmSteps === 0),
    new ButtonBuilder().setCustomId('up_cancel').setLabel('İptal').setEmoji('🚫').setStyle(ButtonStyle.Secondary),
  );

  const sent = await message.reply({ embeds: [buildUpgradePanel(panelData, helpPrefix)], components: [row] });
  const collector = sent.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 30_000,
  });

  collector.on('collect', async (i) => {
    if (i.user.id !== message.author.id) {
      await i.reply({ content: '❌ Bu buton sana ait değil.', flags: 64 });
      return;
    }
    if (i.customId === 'up_cancel') {
      await ctx.redis.del(upgradePanelKey);
      await i.update({ embeds: [buildUpgradeCancel()], components: [] }).catch(() => null);
      collector.stop();
      return;
    }
    try {
      let result = await attemptUpgrade(ctx.prisma, message.author.id, main.id, stat, [], ctx.redis);
      const firstOld = result.oldValue;
      let steps = 1;
      let lastEvo = result.evolution;
      while (steps < confirmSteps) {
        try {
          result = await attemptUpgrade(ctx.prisma, message.author.id, main.id, stat, [], ctx.redis);
          steps++;
          if (result.evolution) lastEvo = result.evolution;
        } catch {
          break;
        }
      }
      await Promise.all([
        armCooldown(ctx.redis, upgradeCooldownKey, UPGRADE_COOLDOWN_MS),
        ctx.redis.del(upgradePanelKey),
        invalidatePlayerCache(ctx.redis, message.author.id),
      ]);
      const baseVal = getBaseStat(main, stat);
      await i.update({
        embeds: [buildUpgradeResult({
          stat,
          oldTrained: firstOld,
          newTrained: result.newValue,
          effectiveOld: baseVal + firstOld,
          effectiveNew: baseVal + result.newValue,
          steps,
        })],
        components: [],
      }).catch(() => null);
      if (lastEvo && message.channel && 'send' in message.channel) {
        await message.channel.send(buildMoonEvolutionFollowUp(lastEvo, helpPrefix)).catch(() => null);
      }
    } catch (error) {
      await ctx.redis.del(upgradePanelKey);
      const errMsg = error instanceof Error ? error.message : 'Bir hata oluştu.';
      const depEmbed = buildUpgradeBlockedEmbed(errMsg, helpPrefix);
      if (depEmbed) {
        await i.update({ embeds: [depEmbed], components: [] }).catch(() => null);
      } else {
        await i.update({ content: `❌ ${errMsg}`, embeds: [], components: [] }).catch(() => null);
      }
    }
    collector.stop();
  });

  collector.on('end', async (_, reason) => {
    if (reason === 'time') {
      await ctx.redis.del(upgradePanelKey);
      await sent.edit({ embeds: [buildUpgradeCancel()], components: [] }).catch(() => null);
    }
  });
}
