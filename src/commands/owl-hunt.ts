/**
 * owl-hunt.ts — /owl hunt komutu + encounter mesajı
 *
 * Biyom sistemi:
 *   - Oyuncu bir kez biyom seçer, Redis'e kaydedilir (30 dk TTL)
 *   - Sonraki hunt'larda seçim menüsü çıkmaz, direkt hunt atılır
 *   - Aktif biyomda "Biyomdan Çık" butonu gösterilir
 *   - 30 dakika sonra otomatik çıkış
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  EmbedBuilder,
} from 'discord.js';
import { HUNT_COOLDOWN_MS, HUNT_COOLDOWN_MAX_REMAINING_MS, BIOMES, BIOME_SESSION_TTL_MS } from '../config';
import { armCooldown, peekCooldownBounded } from '../middleware/cooldown-manager';
import { rollHunt, runHuntSideEffects } from '../systems/hunt';
import {
  getBiomeSession,
  setBiomeSession,
  clearBiomeSession,
  formatSessionRemaining,
} from '../utils/biome-session';
import { commitTameResult } from '../systems/tame';
import {
  createTameSession,
  getTameSession,
  updateTameSession,
  deleteTameSession,
  resolveTurn,
  addUsedLine,
} from '../systems/tame-session';
import { generateNarrative, generateEnding } from '../utils/tame-narrative';
import type { TameAction } from '../utils/tame-narrative';
import {
  buildTameEncounterEmbed,
  buildTameResultEmbed,
  buildTameTimeoutEmbed,
  buildTameActionRow,
  buildTameFinalRow,
  calcFinalTameChance,
} from '../utils/tame-ux';
import { animateHuntMessage, buildFinalMessage, compressHuntResult } from '../utils/hunt-ux';
import { safeReply } from '../utils/safe-reply';
import {
  buildCooldownMessage,
  logCommandError,
  shouldNotifyUserOnDiscord,
  userErrorMessage,
} from '../utils/command-error';
import { listActiveBuffs } from '../systems/items';
import { BUFF_ITEM_MAP } from '../config';
import { getActiveConsumables } from '../utils/use-items';
import { hydratePlayerState } from '../state/player-state';
import { getGuildPrefix } from '../utils/prefix';
import type { CachedOwlData } from '../utils/player-cache';
import {
  buildEncounterEmbed,
  buildEncounterActionRow,
  buildEncounterFightEmbed,
  buildEncounterFleeEmbed,
  buildEncounterTimeoutEmbed,
} from '../utils/encounter-ux';
import type { EncounterOwlData, PlayerOwlData } from '../utils/encounter-ux';
import { resolveEncounterFight, estimateEncounterFightRewards } from '../systems/encounter-fight';
import { parseStoredTraits } from '../systems/traits';
import type { CommandDefinition } from '../types';
import type { Message } from 'discord.js';

const BIOME_PANEL_LOCK_MS = 30_000;

function huntCooldownKey(userId: string): string {
  return `cooldown:hunt:${userId}`;
}

/** true = hunt devam edebilir, false = cooldown/spam engeli */
async function enforceHuntCooldown(
  redis: Parameters<CommandDefinition['execute']>[1]['redis'],
  userId: string,
  notify: (content: string) => Promise<void>,
): Promise<boolean> {
  const cooldown = await peekCooldownBounded(
    redis,
    huntCooldownKey(userId),
    HUNT_COOLDOWN_MAX_REMAINING_MS,
  );
  if (!cooldown.active) return true;
  if (!cooldown.notify) return false;
  await notify(buildCooldownMessage(
    cooldown.expiresAtMs,
    'Tekrar avlanabilirsin',
    cooldown.remainingMs,
  ));
  return false;
}

// ─── Biyom seçim embed'i ─────────────────────────────────────────────────────

function buildBiomeSelectEmbed(): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle('🗺️ Avlanma Bölgesi Seç')
    .setDescription(
      'Seçtiğin bölgede **30 dakika** kalırsın.\n' +
      'Bu süre içinde istediğin kadar hunt atabilirsin.\n' +
      'İstersen erken çıkabilirsin.\n\u200b'
    )
    .setColor(0x2c3e50);

  for (const b of BIOMES) {
    const costStr = b.entryCost > 0
      ? `💰 **Giriş ücreti: ${b.entryCost.toLocaleString()} coin** *(tek seferlik)*`
      : '💰 **Ücretsiz**';

    const modifiers: string[] = [];
    if (b.catchModifier > 1)       modifiers.push(`✅ Yakalama şansı **+${Math.round((b.catchModifier - 1) * 100)}%**`);
    if (b.catchModifier < 1)       modifiers.push(`❌ Yakalama şansı **-${Math.round((1 - b.catchModifier) * 100)}%**`);
    if (b.lootModifier > 1)        modifiers.push(`✅ Materyal drop **+${Math.round((b.lootModifier - 1) * 100)}%**`);
    if (b.rareModifier > 1)        modifiers.push(`✅ Nadir hayvan şansı **x${b.rareModifier}**`);
    if (b.rareModifier < 1)        modifiers.push(`❌ Nadir hayvan şansı **-${Math.round((1 - b.rareModifier) * 100)}%**`);
    if (b.minLevel > 1)            modifiers.push(`🔒 Min. Seviye: **${b.minLevel}**`);

    embed.addFields({
      name: `${b.emoji} ${b.name}`,
      value: [
        b.description,
        costStr,
        modifiers.length > 0 ? modifiers.join('\n') : '📊 Standart ödüller',
      ].join('\n'),
      inline: false,
    });
  }

  embed.setFooter({ text: '💡 Biyomlar hakkında soru sorabilirsin: owl soru en iyi biome hangisi?' });

  return embed;
}

function buildBiomeSelectRow(playerLevel: number): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    BIOMES.map(b => {
      const locked = playerLevel < b.minLevel;
      return new ButtonBuilder()
        .setCustomId(`biome_select:${b.id}`)
        .setLabel(locked
          ? `🔒 ${b.name} (Lv.${b.minLevel}+)`
          : b.entryCost > 0 ? `${b.name} (${b.entryCost}💰)` : b.name)
        .setEmoji(locked ? '🔒' : b.emoji)
        .setStyle(locked ? ButtonStyle.Secondary : b.entryCost === 0 ? ButtonStyle.Secondary : ButtonStyle.Primary)
        .setDisabled(locked);
    })
  );
}

function buildActiveBiomeEmbed(biomeId: string, remaining: string): EmbedBuilder {
  const b = BIOMES.find(x => x.id === biomeId) ?? BIOMES[0]!;
  const costStr = b.entryCost > 0 ? `💰 Giriş ücreti: **${b.entryCost.toLocaleString()} coin** *(ödendi)*` : '💰 **Ücretsiz**';

  return new EmbedBuilder()
    .setTitle(`${b.emoji} Aktif Bölge: ${b.name}`)
    .setDescription(
      `${b.description}\n\n` +
      `${costStr}\n` +
      `⏱️ Kalan süre: **${remaining}**\n\n` +
      `Hunt atmak için tekrar \`owl hunt\` yaz.\n` +
      `Çıkmak için aşağıdaki butonu kullan.`
    )
    .setColor(0x27ae60);
}

function buildActiveBiomeRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('biome_leave')
      .setLabel('Bölgeden Çık')
      .setEmoji('🚪')
      .setStyle(ButtonStyle.Danger)
  );
}

// ─── Hunt sonrasi async encounter ────────────────────────────────────────────

function spawnHuntFollowUp(
  sender: { followUp?: Function; reply?: Function },
  ctx: Parameters<CommandDefinition['execute']>[1],
  userId: string,
  player: { level: number; prestigeLevel?: number },
  mainOwl: CachedOwlData,
  hasCritical: boolean,
  prefix = 'w',
): void {
  void runHuntSideEffects(ctx.prisma, ctx.redis, userId, player, {
    tier: mainOwl.tier,
    statGoz: mainOwl.statGoz,
    statKulak: mainOwl.statKulak,
    statGaga: mainOwl.statGaga,
    statKanat: mainOwl.statKanat,
    statPence: mainOwl.statPence,
  }, hasCritical).then(({ encounterId }) => {
    if (encounterId) {
      void sendEncounterMessage(sender, ctx, userId, encounterId, mainOwl, prefix);
    }
  }).catch(() => null);
}

// ─── Slash: /owl hunt ─────────────────────────────────────────────────────────

export async function runHunt(
  interaction: Parameters<CommandDefinition['execute']>[0],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  const userId = interaction.user.id;

  // ── Aktif biyom oturumu var mı? ──────────────────────────────────────────
  const session = await getBiomeSession(ctx.redis, userId);

  if (!session) {
    const panelLockKey = `hunt:biome_panel:${userId}`;
    const panelLock = await ctx.redis.set(panelLockKey, '1', 'PX', BIOME_PANEL_LOCK_MS, 'NX');
    if (!panelLock) return;

    // Oyuncu seviyesini çek — kilitli biyomları göstermek için
    const playerLevel = (await ctx.prisma.player.findUnique({
      where: { id: userId },
      select: { level: true },
    }))?.level ?? 1;

    // Biyom seçim menüsü göster
    await interaction.reply({
      embeds: [buildBiomeSelectEmbed()],
      components: [buildBiomeSelectRow(playerLevel)],
      flags: 64,
    });
    const panelMsg = await interaction.fetchReply();

    const collector = panelMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 30_000,
      filter: (i) => i.user.id === userId && i.customId.startsWith('biome_select:'),
    });

    collector.on('collect', async (i) => {
      try {
        collector.stop();
        const biomeId = i.customId.split(':')[1] ?? 'b0';
        const biome = BIOMES.find(b => b.id === biomeId);
        if (!biome) return;

        // ÖNEMLİ: Seviye kontrolü ÖNCE yapılmalı (coin kesilmeden)
        if (playerLevel < biome.minLevel) {
          await i.update({
            content: `❌ **${biome.name}** bölgesine girmek için en az **Lv.${biome.minLevel}** olmalısın. Senin seviye: **Lv.${playerLevel}**`,
            embeds: [], components: [],
          });
          return;
        }

        // Giriş ücreti rollHunt içinde hunt lock altında atomik kesilir.
        // Burada coin kesmiyoruz — double-charge ve race condition önlenir.

        const newSession = await setBiomeSession(ctx.redis, userId, biomeId);
        await i.update({
          embeds: [buildActiveBiomeEmbed(biomeId, formatSessionRemaining(newSession))],
          components: [buildActiveBiomeRow()],
        });

        // Çıkış butonu collector'ı
        const leaveCollector = panelMsg.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: BIOME_SESSION_TTL_MS,
          filter: (li) => li.user.id === userId && li.customId === 'biome_leave',
        });
        leaveCollector.on('collect', async (li) => {
          leaveCollector.stop();
          await clearBiomeSession(ctx.redis, userId);
          await li.update({ content: `🚪 **${biome.name}** bölgesinden çıktın.`, embeds: [], components: [] });
        });
      } catch {
        // panelLock collector.on('end') ile temizlenir
      }
    });

    collector.on('end', (_, reason) => {
      ctx.redis.del(panelLockKey).catch(() => null);
      if (reason === 'time') {
        interaction.editReply({ content: '⏰ Seçim süresi doldu.', embeds: [], components: [] }).catch(() => null);
      }
    });
    return;
  }

  // ── Aktif biyom var — cooldown kontrolü ve hunt ───────────────────────────
  const canHunt = await enforceHuntCooldown(
    ctx.redis,
    userId,
    async (content) => { await interaction.reply({ content, flags: 64 }); },
  );
  if (!canHunt) return;

  await interaction.deferReply({ flags: 64 });

  const bundle = await hydratePlayerState(ctx.redis, ctx.prisma, userId);
  if (!bundle || !bundle.mainOwl) {
    await interaction.editReply({ content: '❌ **Hata** | Main baykuş bulunamadı.' });
    return;
  }

  try {
    const result = await rollHunt(ctx.prisma, ctx.redis, userId, bundle.mainOwl.id, session.biomeId);
    await armCooldown(ctx.redis, huntCooldownKey(userId), HUNT_COOLDOWN_MS);
    const compressed = compressHuntResult(result);
    const name = interaction.member && 'displayName' in interaction.member
      ? (interaction.member as { displayName: string }).displayName
      : interaction.user.username;
    const prefix = interaction.guildId
      ? await getGuildPrefix(ctx.redis, interaction.guildId)
      : 'w';

    await interaction.editReply({ content: buildFinalMessage(name, compressed, prefix) });

    spawnHuntFollowUp(
      { followUp: interaction.followUp.bind(interaction) },
      ctx,
      userId,
      bundle.player,
      bundle.mainOwl,
      result.catches.some((c) => c.critical),
      prefix,
    );
  } catch (err: any) {
    // Biyom süresi dolmuşsa oturumu temizle
    if (err.message?.includes('biyom') || err.message?.includes('coin')) {
      await clearBiomeSession(ctx.redis, userId);
    }
    if (shouldNotifyUserOnDiscord(err)) {
      await interaction.editReply({ content: userErrorMessage(err) });
    } else {
      logCommandError('Hunt Slash Error', err);
      await interaction.deleteReply().catch(() => null);
    }
  }
}

// ─── Prefix: owl hunt ─────────────────────────────────────────────────────────

export async function runHuntMessage(
  message: Message,
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  const userId = message.author.id;

  // ── "owl hunt çık" komutu ─────────────────────────────────────────────────
  const args = message.content.trim().split(/\s+/);
  const lastArg = args[args.length - 1]?.toLowerCase();
  if (lastArg === 'çık' || lastArg === 'cik' || lastArg === 'exit' || lastArg === 'leave') {
    const existing = await getBiomeSession(ctx.redis, userId);
    if (!existing) {
      await message.reply('❌ Zaten aktif bir bölgede değilsin.');
      return;
    }
    const biome = BIOMES.find(b => b.id === existing.biomeId);
    await clearBiomeSession(ctx.redis, userId);
    await message.reply(`🚪 **${biome?.name ?? 'Bölge'}**'den çıktın.`);
    return;
  }

  // ── Aktif biyom oturumu var mı? ──────────────────────────────────────────
  const session = await getBiomeSession(ctx.redis, userId);

  if (!session) {
    const panelLockKey = `hunt:biome_panel:${userId}`;
    const panelLock = await ctx.redis.set(panelLockKey, '1', 'PX', BIOME_PANEL_LOCK_MS, 'NX');
    if (!panelLock) return;

    // Oyuncu seviyesini çek — kilitli biyomları göstermek için
    const playerLevel = (await ctx.prisma.player.findUnique({
      where: { id: userId },
      select: { level: true },
    }))?.level ?? 1;

    // Biyom seçim menüsü göster
    const biomeMsg = await message.reply({
      embeds: [buildBiomeSelectEmbed()],
      components: [buildBiomeSelectRow(playerLevel)],
    });

    const collector = biomeMsg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 30_000,
      filter: (i) => i.user.id === userId && i.customId.startsWith('biome_select:'),
    });

    collector.on('collect', async (i) => {
      try {
        collector.stop();
        const biomeId = i.customId.split(':')[1] ?? 'b0';
        const biome = BIOMES.find(b => b.id === biomeId);
        if (!biome) return;

        // ÖNEMLİ: Seviye kontrolü ÖNCE yapılmalı (coin kesilmeden)
        if (playerLevel < biome.minLevel) {
          await i.update({
            content: `❌ **${biome.name}** bölgesine girmek için en az **Lv.${biome.minLevel}** olmalısın. Senin seviye: **Lv.${playerLevel}**`,
            embeds: [], components: [],
          });
          return;
        }

        // Giriş ücreti rollHunt içinde hunt lock altında atomik kesilir.
        // Burada coin kesmiyoruz — double-charge ve race condition önlenir.

        const newSession = await setBiomeSession(ctx.redis, userId, biomeId);
        await i.update({
          embeds: [buildActiveBiomeEmbed(biomeId, formatSessionRemaining(newSession))],
          components: [buildActiveBiomeRow()],
        });

        // Çıkış butonu collector'ı (30 dk boyunca dinle)
        const leaveCollector = biomeMsg.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: BIOME_SESSION_TTL_MS,
          filter: (li) => li.user.id === userId && li.customId === 'biome_leave',
        });
        leaveCollector.on('collect', async (li) => {
          leaveCollector.stop();
          await clearBiomeSession(ctx.redis, userId);
          await li.update({ content: `🚪 **${biome.name}** bölgesinden çıktın.`, embeds: [], components: [] });
        });
        leaveCollector.on('end', (_, reason) => {
          if (reason === 'time') {
            // 30 dk doldu, mesajı güncelle
            biomeMsg.edit({ content: '⏰ Bölge süresi doldu, otomatik çıkış yapıldı.', embeds: [], components: [] }).catch(() => null);
          }
        });
      } catch {
        // panelLock collector.on('end') ile temizlenir
      }
    });

    collector.on('end', (_, reason) => {
      ctx.redis.del(panelLockKey).catch(() => null);
      if (reason === 'time') {
        biomeMsg.edit({ content: '⏰ Seçim süresi doldu.', embeds: [], components: [] }).catch(() => null);
      }
    });
    return;
  }

  // ── Aktif biyom var — cooldown kontrolü ve hunt ───────────────────────────
  const canHunt = await enforceHuntCooldown(
    ctx.redis,
    userId,
    async (content) => { await message.reply(content); },
  );
  if (!canHunt) return;

  const bundle = await hydratePlayerState(ctx.redis, ctx.prisma, userId);
  if (!bundle || !bundle.mainOwl) {
    await message.reply('❌ **Hata** | Main baykuş bulunamadı.');
    return;
  }

  let loadingMsg: Awaited<ReturnType<typeof safeReply>> | null = null;
  try {
    loadingMsg = await safeReply(message, '🦅 **Avlanıyor...**');
    const result = await rollHunt(ctx.prisma, ctx.redis, userId, bundle.mainOwl.id, session.biomeId);
    await armCooldown(ctx.redis, huntCooldownKey(userId), HUNT_COOLDOWN_MS);
    const compressed = compressHuntResult(result);
    const name = message.member?.displayName ?? message.author.username;

    // Aktif hunt buff'larını çek — hunt mesajında göster (senkron, animasyondan önce)
    try {
      const rawBuffs = await listActiveBuffs(ctx.prisma as any, userId);
      compressed.activeBuffs = rawBuffs
        .filter((b) => b.chargeCur > 0 && b.category === 'hunt')
        .map((b) => ({
          emoji: BUFF_ITEM_MAP[b.buffItemId]?.emoji ?? '✨',
          chargeCur: b.chargeCur,
          chargeMax: b.chargeMax,
        }));

      const activeCons = await getActiveConsumables(ctx.redis, userId);
      compressed.activeConsumables = activeCons
        .filter(({ def }) =>
          def.effectType === 'hunt_catch_once'
          || def.effectType === 'hunt_loot_once'
          || def.effectType === 'stamina_restore_once'
          || def.effectType === 'stamina_boost_once',
        )
        .map(({ def, expiresAt }) => ({
          emoji: def.emoji,
          name: def.itemName,
          remainingMs: expiresAt - Date.now(),
        }));
    } catch { /* hata hunt'u engellemesin */ }

    const prefix = message.guildId
      ? await getGuildPrefix(ctx.redis, message.guildId)
      : 'w';
    const finalText = buildFinalMessage(name, compressed, prefix);
    await loadingMsg.edit(finalText).catch(() => safeReply(message, finalText));

    spawnHuntFollowUp(
      { reply: (payload: unknown) => safeReply(message, payload as Parameters<typeof safeReply>[1]) },
      ctx,
      userId,
      bundle.player,
      bundle.mainOwl,
      result.catches.some((c) => c.critical),
      prefix,
    );
  } catch (err: any) {
    if (err.message?.includes('biyom') || err.message?.includes('coin')) {
      await clearBiomeSession(ctx.redis, userId);
    }
    if (shouldNotifyUserOnDiscord(err)) {
      const text = userErrorMessage(err);
      if (loadingMsg) {
        await loadingMsg.edit(text).catch(() => safeReply(message, { content: text }));
      } else {
        await safeReply(message, { content: text });
      }
    } else {
      logCommandError('Hunt Message Error', err);
      if (loadingMsg) await loadingMsg.delete().catch(() => null);
    }
  }
}

// ─── Encounter mesajı ve buton handler ───────────────────────────────────────

export async function sendEncounterMessage(
  sender: { followUp?: Function; reply?: Function },
  ctx: Parameters<CommandDefinition['execute']>[1],
  userId: string,
  encounterId: string,
  playerOwl: {
    species: string; tier: number; quality: string;
    statGaga: number; statGoz: number; statKulak: number;
    statKanat: number; statPence: number; hp: number; hpMax: number;
  },
  prefix = 'w',
): Promise<void> {
  const encounter = await ctx.prisma.encounter.findFirst({
    where: { id: encounterId, playerId: userId },
    select: {
      id: true, status: true,
      owlSpecies: true, owlTier: true, owlQuality: true,
      owlStats: true, owlTraits: true,
    } as any,
  }) as any;

  if (!encounter || encounter.status !== 'open') return;

  const rawStats = encounter.owlStats as Record<string, number>;
  const wildData: EncounterOwlData = {
    species:   encounter.owlSpecies,
    tier:      encounter.owlTier,
    quality:   encounter.owlQuality,
    statGaga:  rawStats.gaga  ?? 10,
    statGoz:   rawStats.goz   ?? 10,
    statKulak: rawStats.kulak ?? 10,
    statKanat: rawStats.kanat ?? 10,
    statPence: rawStats.pence ?? 10,
    traits:    parseStoredTraits(encounter.owlTraits),
  };

  const playerData: PlayerOwlData = {
    species:   playerOwl.species,
    tier:      playerOwl.tier,
    quality:   playerOwl.quality,
    statGaga:  playerOwl.statGaga,
    statGoz:   playerOwl.statGoz,
    statKulak: playerOwl.statKulak,
    statKanat: playerOwl.statKanat,
    statPence: playerOwl.statPence,
    hp:        playerOwl.hp,
    hpMax:     playerOwl.hpMax,
  };

  const sumStats = (d: EncounterOwlData | PlayerOwlData) =>
    d.statGaga + d.statGoz + d.statKulak + d.statKanat + d.statPence;

  const fightPreview = estimateEncounterFightRewards(
    wildData.tier,
    wildData.quality,
    sumStats(playerData),
    sumStats(wildData),
  );

  const embed = buildEncounterEmbed(wildData, playerData, fightPreview, prefix);
  const row   = buildEncounterActionRow(encounterId);

  const sendFn = sender.followUp ?? sender.reply;
  if (!sendFn) return;

  const sent = await sendFn({ embeds: [embed], components: [row] }) as {
    createMessageComponentCollector: Function;
    edit: Function;
  };

  const collector = sent.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 60_000,
    filter: (i: any) => i.user.id === userId && i.customId.startsWith('enc_'),
  });

  collector.on('collect', async (i: any) => {
    const [action, eid] = i.customId.split(':') as [string, string];

    const enc = await ctx.prisma.encounter.findFirst({
      where: { id: eid, playerId: userId },
      select: { status: true },
    });
    if (!enc || enc.status !== 'open') {
      await i.update({ content: '❌ Bu encounter artık aktif değil.', embeds: [], components: [] });
      collector.stop();
      return;
    }

    if (action === 'enc_flee') {
      await ctx.prisma.encounter.update({ where: { id: eid }, data: { status: 'closed' } });
      await i.update({ embeds: [buildEncounterFleeEmbed(wildData.species)], components: [] });
      collector.stop();
      return;
    }

    if (action === 'enc_tame') {
      await i.update({
        embeds: [],
        content: `🦉 Evcilleştirme başlatılıyor...\n\`owl tame ${eid}\` komutunu kullan veya aşağıdaki butona bas.`,
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
              .setCustomId(`enc_tame_start:${eid}`)
              .setLabel('🟢 Evcilleştirmeyi Başlat')
              .setStyle(ButtonStyle.Success),
          ),
        ],
      });

      const tameMsg = await i.fetchReply();
      const tameCollector = tameMsg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 30_000,
        filter: (bi: any) => bi.user.id === userId && bi.customId.startsWith('enc_tame_start:'),
      });

      tameCollector.on('collect', async (bi: any) => {
        tameCollector.stop();
        const freshMain = await ctx.prisma.owl.findFirst({ where: { ownerId: userId, isMain: true } });
        if (!freshMain) {
          await bi.update({ content: '❌ Main baykuş bulunamadı.', components: [] });
          return;
        }
        const freshEnc = await ctx.prisma.encounter.findFirst({ where: { id: eid, playerId: userId } });
        if (!freshEnc || freshEnc.status !== 'open') {
          await bi.update({ content: '❌ Encounter artık aktif değil.', components: [] });
          return;
        }

        const state = await createTameSession(
          ctx.redis, eid, userId,
          freshEnc.owlSpecies, freshEnc.owlTier, freshEnc.owlQuality,
          freshMain.statGoz, freshMain.statKulak,
        );
        const narrative = generateNarrative({
          personality: state.personality,
          action: 'silent',
          outcome: 'ongoing' as any,
          turn: state.turn,
          progress: state.progress,
          escapeRisk: state.escapeRisk,
          usedLines: state.usedLines,
        });
        for (const line of [narrative.reaction, narrative.hint].filter(Boolean)) {
          addUsedLine(state, line);
        }
        await updateTameSession(ctx.redis, state);

        await bi.update({
          content: null,
          embeds: [buildTameEncounterEmbed(state, narrative)],
          components: [buildTameActionRow(eid, state)],
        });

        const tameActionCollector = tameMsg.createMessageComponentCollector({
          componentType: ComponentType.Button,
          time: 120_000,
          filter: (ti: any) => ti.user.id === userId && ti.customId.startsWith('tame_'),
        });

        tameActionCollector.on('collect', async (ti: any) => {
          const actionMap: Record<string, TameAction> = {
            tame_silent: 'silent', tame_distract: 'distract', tame_advance: 'advance',
          };
          const actionKey = ti.customId.split(':')[0] ?? 'tame_silent';
          const current = await getTameSession(ctx.redis, userId);
          if (!current) {
            await ti.update({ content: '❌ Seans sona erdi.', embeds: [], components: [] });
            tameActionCollector.stop();
            return;
          }

          if (actionKey === 'tame_attempt') {
            tameActionCollector.stop('done');
            await deleteTameSession(ctx.redis, userId);
            const finalChance = calcFinalTameChance(current);
            const success = Math.random() * 100 < finalChance;
            await commitTameResult(ctx.prisma, userId, eid, success);
            const ending = generateEnding(current.personality, success, current.progress, current.usedLines);
            await ti.update({ embeds: [buildTameResultEmbed(current, success, ending)], components: [] });
            return;
          }

          const tameAction = actionMap[actionKey] ?? 'silent';
          const turnResult = resolveTurn(current, tameAction);
          current.progress   = Math.max(0, Math.min(100, current.progress + turnResult.progressDelta));
          current.escapeRisk = Math.max(0, Math.min(100, current.escapeRisk + turnResult.escapeDelta));
          current.turn += 1;

          const tNarrative = generateNarrative({
            personality: current.personality, action: tameAction,
            outcome: turnResult.outcome === 'ongoing' ? 'success' : turnResult.outcome,
            turn: current.turn, progress: current.progress,
            escapeRisk: current.escapeRisk, usedLines: current.usedLines,
          });
          for (const line of [tNarrative.reaction, tNarrative.continuation, tNarrative.hint].filter(Boolean)) {
            addUsedLine(current, line);
          }

          const isOver = turnResult.escaped || turnResult.tamed || current.turn > current.maxTurns;
          if (isOver) {
            tameActionCollector.stop('done');
            await deleteTameSession(ctx.redis, userId);
            const success = turnResult.tamed;
            await commitTameResult(ctx.prisma, userId, eid, success);
            const ending = generateEnding(current.personality, success, current.progress, current.usedLines);
            await ti.update({ embeds: [buildTameResultEmbed(current, success, ending)], components: [] });
            return;
          }

          await updateTameSession(ctx.redis, current);
          const components: ActionRowBuilder<ButtonBuilder>[] = [buildTameActionRow(eid, current)];
          if (current.progress >= 50) components.push(buildTameFinalRow(eid, current));
          await ti.update({ embeds: [buildTameEncounterEmbed(current, tNarrative)], components });
        });

        tameActionCollector.on('end', async (_: any, reason: string) => {
          if (reason === 'time') {
            await deleteTameSession(ctx.redis, userId);
            await tameMsg.edit({ embeds: [buildTameTimeoutEmbed(state)], components: [] }).catch(() => null);
          }
        });
      });

      tameCollector.on('end', async (_: any, reason: string) => {
        if (reason === 'time') {
          await (tameMsg).edit({ content: '⏰ Süre doldu.', components: [] }).catch(() => null);
        }
      });

      collector.stop();
      return;
    }

    if (action === 'enc_fight') {
      await i.deferUpdate();
      try {
        const fightResult = await resolveEncounterFight(ctx.prisma, userId, eid, ctx.redis);
        await i.editReply({ embeds: [buildEncounterFightEmbed(fightResult)], components: [] });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Bir hata oluştu.';
        await i.editReply({ content: `❌ ${msg}`, embeds: [], components: [] });
      }
      collector.stop();
      return;
    }
  });

  collector.on('end', async (_: any, reason: string) => {
    if (reason === 'time') {
      await sent.edit({ embeds: [buildEncounterTimeoutEmbed(wildData.species)], components: [] }).catch(() => null);
      await ctx.prisma.encounter.update({
        where: { id: encounterId },
        data: { status: 'closed' },
      }).catch(() => null);
    }
  });
}
