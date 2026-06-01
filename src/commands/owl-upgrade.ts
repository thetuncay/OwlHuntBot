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
  type UpgradeOverviewOwlStats,
} from '../utils/upgrade-ux';
import type { UpgradePanelData } from '../utils/upgrade-ux';
import { failEmbed } from '../utils/embed';
import type { CommandDefinition, OwlStatKey } from '../types';
import { UPGRADE_COOLDOWN_SUCCESS_MS, UPGRADE_COOLDOWN_FAIL_MS, UPGRADE_STATS } from './owl-utils';
import { getPlayerBundle, invalidatePlayerCache } from '../utils/player-cache';
import { reloadInventoryFromPg } from '../state/player-state';
import { buildCooldownMessage } from '../utils/command-error';
import { replyCooldownIfAllowed, replyWithSuppression, SuppressionKeys } from '../utils/guarded-discord';

// ─── Slash: /owl upgrade ──────────────────────────────────────────────────────

export async function runUpgrade(
  interaction: Parameters<CommandDefinition['execute']>[0],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  const stat = interaction.options.getString('stat', true) as OwlStatKey;

  const cooldownKey = `cooldown:upgrade:${interaction.user.id}`;
  const cooldown = await peekCooldown(ctx.redis, cooldownKey);
  if (cooldown.active) {
    if (!cooldown.notify) return;
    await interaction.reply({
      content: buildCooldownMessage(
        cooldown.remainingMs,
        'upgrade',
        interaction.member && 'displayName' in interaction.member
          ? (interaction.member as { displayName: string }).displayName
          : interaction.user.username,
      ),
      flags: 64,
    });
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
    await interaction.reply({ embeds: [failEmbed('Hata', 'Main baykus bulunamadi.')], flags: 64 });
    return;
  }

  const preview = await getUpgradePreview(ctx.prisma, interaction.user.id, main.id, stat, [], ctx.redis);
  const panelData: UpgradePanelData = {
    owlName:     main.species,
    owlQuality:  main.quality,
    playerLevel: player.level,
    stat,
    statValue:   preview.statValue,
    chance:      preview.chance,
    consumableBonus: preview.consumableBonus,
    downgradeShieldMult: preview.downgradeShieldMult,
    allStats: {
      gaga: main.statGaga, goz: main.statGoz,
      kulak: main.statKulak, kanat: main.statKanat, pence: main.statPence,
    },
    depCheck: preview.depCheck,
  };

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

  await interaction.reply({ embeds: [buildUpgradePanel(panelData)], components: [row], flags: 64 });

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
      const cdMs = result.success ? UPGRADE_COOLDOWN_SUCCESS_MS : UPGRADE_COOLDOWN_FAIL_MS;
      await Promise.all([
        armCooldown(ctx.redis, cooldownKey, cdMs),
        ctx.redis.del(panelLockKey),
        // Stat değişti — cache'i invalidate et
        invalidatePlayerCache(ctx.redis, interaction.user.id),
        reloadInventoryFromPg(ctx.redis, ctx.prisma, interaction.user.id),
      ]);
      await i.update({
        embeds: [buildUpgradeResult({
          stat, success: result.success,
          oldValue: result.oldValue, newValue: result.newValue, chance: result.chance,
        })],
        components: [],
      }).catch(() => null);
    } catch (error) {
      await ctx.redis.del(panelLockKey);
      const errMsg = error instanceof Error ? error.message : 'Bir hata oluştu.';
      const depEmbed = buildDepBlockedEmbed(errMsg);
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
  const stat = (args[0] ?? '').toLowerCase() as OwlStatKey;

  if (!stat || !UPGRADE_STATS.includes(stat)) {
    // Oyuncu stat bilgisini çek — overview'da mevcut seviyeleri göster
    const overviewBundle = await getPlayerBundle(ctx.redis, ctx.prisma, message.author.id);
    const overviewOwl = overviewBundle?.mainOwl;
    const owlStats: UpgradeOverviewOwlStats | undefined = overviewOwl
      ? { gaga: overviewOwl.statGaga, pence: overviewOwl.statPence, goz: overviewOwl.statGoz, kulak: overviewOwl.statKulak, kanat: overviewOwl.statKanat }
      : undefined;
    await message.reply({ embeds: [buildUpgradeOverview(helpPrefix, owlStats)] });
    return;
  }

  const upgradeCooldownKey = `cooldown:upgrade:${message.author.id}`;
  const cooldown = await peekCooldown(ctx.redis, upgradeCooldownKey);
  if (cooldown.active) {
    if (!cooldown.notify) return;
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
      `❌ **Hata** | Main baykus bulunamadi.`,
      SuppressionKeys.pvp('no-main'),
    );
    return;
  }

  const preview = await getUpgradePreview(ctx.prisma, message.author.id, main.id, stat, [], ctx.redis);
  const panelData: UpgradePanelData = {
    owlName:     main.species,
    owlQuality:  main.quality,
    playerLevel: player.level,
    stat,
    statValue:   preview.statValue,
    chance:      preview.chance,
    consumableBonus: preview.consumableBonus,
    downgradeShieldMult: preview.downgradeShieldMult,
    allStats: {
      gaga: main.statGaga, goz: main.statGoz,
      kulak: main.statKulak, kanat: main.statKanat, pence: main.statPence,
    },
    depCheck: preview.depCheck,
  };

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

  const sent = await message.reply({ embeds: [buildUpgradePanel(panelData)], components: [row] });
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
      const result = await attemptUpgrade(ctx.prisma, message.author.id, main.id, stat, [], ctx.redis);
      const cdMs = result.success ? UPGRADE_COOLDOWN_SUCCESS_MS : UPGRADE_COOLDOWN_FAIL_MS;
      await Promise.all([
        armCooldown(ctx.redis, upgradeCooldownKey, cdMs),
        ctx.redis.del(upgradePanelKey),
        // Stat değişti — cache'i invalidate et
        invalidatePlayerCache(ctx.redis, message.author.id),
        reloadInventoryFromPg(ctx.redis, ctx.prisma, message.author.id),
      ]);
      await i.update({
        embeds: [buildUpgradeResult({
          stat, success: result.success,
          oldValue: result.oldValue, newValue: result.newValue, chance: result.chance,
        })],
        components: [],
      }).catch(() => null);
    } catch (error) {
      await ctx.redis.del(upgradePanelKey);
      const errMsg = error instanceof Error ? error.message : 'Bir hata oluştu.';
      const depEmbed = buildDepBlockedEmbed(errMsg);
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
