/**
 * owl-misc.ts — sell, zoo, cash, prefix, aç, buff komutları
 */

import { EmbedBuilder, PermissionFlagsBits, type Message } from 'discord.js';
import { COIN_EMOJI, formatCoinLabel } from '../config/ui-emojis';
import { buildRewardClaimMessage, resultPipe } from '../utils/result-ux';
import { PREY, PREY_MIN_SELL_PRICE, LOOTBOX_DEFS, LOOTBOX_DEF_MAP, HUNT_WEEKEND_COIN_MULT, isWeekendHuntBonus } from '../config';
import { setGuildPrefix } from '../utils/prefix';
import { failEmbed, successEmbed, infoEmbed } from '../utils/embed';
import { replyWithSuppression, SuppressionKeys } from '../utils/guarded-discord';
import { openLootbox, openAllLootboxes, listLootboxInventory, getPityCounts } from '../systems/lootbox';
import type Redis from 'ioredis';
import type { CommandDefinition } from '../types';
import { applyCoinDeltaInRedis, hydratePlayerState, mirrorInventoryFromPg } from '../state/player-state';
import { withLock, LOCK_BUSY_MESSAGES } from '../utils/lock';
import { recordSellTelemetry } from '../utils/sell-telemetry';
import { trackSellQuests, trackEarnCoinsQuests, fireQuestBatch } from '../systems/quest-tracker';
import { mergeQuestNotices } from '../systems/daily-quests';
import { appendLostFooterIfNeeded } from '../utils/flow-helpers';
import { renderPreyEmoji, displayLootboxEmoji } from '../config/custom-emojis';
import { momentMarker } from '../config/moment-highlights';
import { COLORS, rarityDot, rarityRank } from '../utils/theme';
import { buildXpStatusEmbed } from '../utils/xp-ux';
import { claimRebalanceCompensation, getPendingCompensation, daysUntilExpiry } from '../systems/rebalance-compensation';
import { getPreyDexView } from '../systems/prey-dex';
import { buildFullZooMessages } from '../utils/zoo-ux';
import { getGambleStats } from '../systems/gamble/gamble-stats';
import { buildGambleStatsEmbed } from '../utils/gamble-stats-ux';

// ─── Paylaşılan sabitler ──────────────────────────────────────────────────────

const SELL_PRICES: Record<string, number> = Object.fromEntries(
  PREY.map((p) => [p.name, p.sellPrice]),
);

const RARITY_ORDER: Record<string, number> = { Rare: 0, Uncommon: 1, Common: 2 };
const RARITY_LABEL: Record<string, string>  = { Rare: '🟣 Nadir', Uncommon: '🔵 Sıradışı', Common: '⚪ Yaygın' };

// ─── sell ─────────────────────────────────────────────────────────────────────

export async function runSellMessage(
  message: Message,
  args: string[],
  ctx: Parameters<CommandDefinition['execute']>[1],
  helpPrefix: string,
): Promise<void> {
  const target = (args[0] ?? '').toLowerCase();
  const playerId = message.author.id;

  if (!target) {
    const avItems = await ctx.prisma.inventoryItem.findMany({
      where: { ownerId: playerId, itemType: 'Av' },
      orderBy: { quantity: 'desc' },
    });
    const lines = [
      '**Av hayvanlarını coin\'e çevir.**',
      '',
      '**Kullanım:**',
      `\`${helpPrefix} sell all\` — tüm avları sat`,
      `\`${helpPrefix} sell fare\` — belirli avı sat`,
      '',
      avItems.length > 0
        ? '**Envanterindeki avlar:**'
        : '_Henüz avın yok — önce `hunt` yap._',
      ...avItems.slice(0, 10).map((i) => {
        const emoji = renderPreyEmoji(i.itemName);
        const price = SELL_PRICES[i.itemName] ?? PREY_MIN_SELL_PRICE;
        return `${emoji} **${i.itemName}** ×${i.quantity} — ${formatCoinLabel(price * i.quantity)} · \`${helpPrefix} sell ${i.itemName}\``;
      }),
    ];
    await message.reply({ embeds: [infoEmbed(`${COIN_EMOJI} Av Satışı`, lines.join('\n'))] });
    return;
  }

  if (target !== 'all' && !(target in SELL_PRICES)) {
    await message.reply({
      embeds: [failEmbed(
        'Bilinmeyen av',
        `\`${target}\` tanınmıyor.\n\n` +
          `\`${helpPrefix} sell all\` — hepsini sat\n` +
          `\`${helpPrefix} sell fare\` — tek av sat`,
      )],
    });
    return;
  }

  let totalCoins = 0;
  let totalCount = 0;
  let soldLines: Array<{ itemName: string; quantity: number; rarity: string }> = [];

  await withLock(playerId, 'financial', async () => {
    const result = await ctx.prisma.$transaction(async (tx) => {
      const items = await tx.inventoryItem.findMany({
        where: { ownerId: playerId, itemType: 'Av' },
      });
      if (items.length === 0) {
        return null;
      }

      let toSell = items;
      if (target !== 'all') {
        toSell = items.filter((i) => i.itemName === target);
        if (toSell.length === 0) {
          return { error: `❌ **${target}** envanterinde yok.` as const };
        }
      }

      let coins = toSell.reduce(
        (sum, i) => sum + (SELL_PRICES[i.itemName] ?? PREY_MIN_SELL_PRICE) * i.quantity,
        0,
      );
      if (isWeekendHuntBonus()) {
        coins = Math.round(coins * HUNT_WEEKEND_COIN_MULT);
      }
      const count = toSell.reduce((sum, i) => sum + i.quantity, 0);

      const deleted = await tx.inventoryItem.deleteMany({
        where: { id: { in: toSell.map((i) => i.id) } },
      });
      if (deleted.count === 0) {
        throw new Error('❌ Satılacak av bulunamadı — envanter güncellenmiş olabilir.');
      }

      await tx.player.update({
        where: { id: playerId },
        data: { coins: { increment: coins } },
      });

      await tx.auditLog.create({
        data: {
          playerId,
          action: 'sell_prey',
          before: { preyRows: toSell.length, preyQty: count },
          after: {
            coinsGained: coins,
            preySold: toSell.map((i) => ({ name: i.itemName, qty: i.quantity })),
          },
        },
      });

      return {
        coins,
        count,
        auditPrey: toSell.map((i) => ({ name: i.itemName, qty: i.quantity })),
        toSell: toSell.map((i) => ({ itemName: i.itemName, quantity: i.quantity, rarity: i.rarity })),
      };
    });

    if (!result) {
      await message.reply(`🎒 Satacak av hayvanın yok. Önce \`${helpPrefix} hunt\` yap!`);
      return;
    }
    if ('error' in result && result.error) {
      await message.reply(result.error);
      return;
    }

    totalCoins = result.coins;
    totalCount = result.count;
    soldLines = result.toSell;

    await recordSellTelemetry(ctx.redis, ctx.prisma, {
      userId: playerId,
      guildId: message.guildId,
      coinsGained: totalCoins,
      preySold: result.auditPrey,
      preyQty: totalCount,
      source: 'prefix',
    });

    await applyCoinDeltaInRedis(
      ctx.redis,
      playerId,
      totalCoins,
      ctx.prisma,
      message.guildId,
    );
    await mirrorInventoryFromPg(ctx.redis, ctx.prisma, playerId);
    await mergeQuestNotices(
      await trackSellQuests(ctx.prisma, playerId, totalCount, ctx.redis),
      await trackEarnCoinsQuests(ctx.prisma, playerId, totalCoins, ctx.redis),
    );
  }, LOCK_BUSY_MESSAGES.sell);

  if (totalCount === 0) return;

  const player = await ctx.prisma.player.findUnique({
    where:  { id: playerId },
    select: { coins: true },
  });

  const sorted = [...soldLines].sort(
    (a, b) => (RARITY_ORDER[a.rarity] ?? 2) - (RARITY_ORDER[b.rarity] ?? 2),
  );
  const lootParts = sorted.map((i) => {
    const emoji = renderPreyEmoji(i.itemName);
    return `${emoji}×${i.quantity}`;
  });
  const name = message.member?.displayName ?? message.author.username;

  const text = buildRewardClaimMessage({
    headline: `💰 ${name}, avlarını sattı.`,
    sections: lootParts.length
      ? [{ label: '🎒 Satış', lines: [lootParts.join(' ')] }]
      : undefined,
    coin: totalCoins,
    extras: [
      resultPipe(`📦 ${totalCount} hayvan`),
      resultPipe(`🏦 ${formatCoinLabel(player?.coins ?? totalCoins)}`),
      `💡 Materyal için \`${helpPrefix} parçala\` · \`${helpPrefix} hunt\``,
    ],
  });

  await message.reply(text);
}

// ─── zoo ──────────────────────────────────────────────────────────────────────

export async function runZooMessage(
  message: Message,
  ctx: Parameters<CommandDefinition['execute']>[1],
  helpPrefix: string,
): Promise<void> {
  const name = message.member?.displayName ?? message.author.username;

  try {
    const [rows, owls] = await Promise.all([
      getPreyDexView(ctx.prisma, message.author.id),
      ctx.prisma.owl.findMany({
        where: { ownerId: message.author.id },
        orderBy: [{ isMain: 'desc' }, { tier: 'asc' }, { quality: 'asc' }],
      }),
    ]);
    const parts = buildFullZooMessages({ username: name, rows, helpPrefix, owls });
    await message.reply(parts[0]!);
    if (message.channel.isSendable()) {
      for (let i = 1; i < parts.length; i++) {
        await message.channel.send(parts[i]!);
      }
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.includes('PlayerPreyDex') || errMsg.includes('does not exist')) {
      await message.reply(
        `🌿 **${name}'in Hayvanat Bahçesi**\n\n` +
        '⚠️ Koleksiyon sistemi henüz veritabanına uygulanmadı. Yönetici: `prisma migrate deploy`',
      );
      return;
    }
    throw error;
  }
}

// ─── cash ─────────────────────────────────────────────────────────────────────

export async function runCashMessage(
  message: Message,
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  const bundle = await hydratePlayerState(ctx.redis, ctx.prisma, message.author.id);
  const player = bundle?.player;
  if (!player) {
    await message.reply(`❌ Kayıtlı değilsin.`);
    return;
  }
  const name = message.member?.displayName ?? message.author.username;
  let text =
    `**${name}**, bakiye: ${formatCoinLabel(player.coins)} · Lv.**${player.level}**`;
  text = await appendLostFooterIfNeeded(ctx.redis, message.author.id, 'cash', text);
  await message.reply(text);
}

// ─── xp ───────────────────────────────────────────────────────────────────────

export async function runXpMessage(
  message: Message,
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  const player = await ctx.prisma.player.findUnique({
    where: { id: message.author.id },
    select: { level: true, xp: true, totalXP: true },
  });
  if (!player) {
    await message.reply(`❌ Kayıtlı değilsin.`);
    return;
  }
  const name = message.member?.displayName ?? message.author.username;
  await message.reply({
    embeds: [buildXpStatusEmbed(name, player.level, player.xp, player.totalXP)],
  });
}

// ─── prefix ───────────────────────────────────────────────────────────────────

export async function runPrefixMessage(
  message: Message,
  args: string[],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  if (!message.guildId) {
    await message.reply(`❌ **Hata** | Bu komut sadece sunucuda kullanilabilir.`);
    return;
  }
  const hasAdmin = message.member?.permissions.has(PermissionFlagsBits.Administrator) ?? false;
  if (!hasAdmin) {
    await replyWithSuppression(
      message,
      `🔒 **Yetki** | Prefix ayari icin yonetici yetkisi gerekir.`,
      SuppressionKeys.permission('prefix-admin'),
    );
    return;
  }
  const value = (args[0] ?? '').trim().toLowerCase();
  if (!value || !/^[a-z0-9]{1,16}$/i.test(value)) {
    await replyWithSuppression(
      message,
      `❌ **Gecersiz Prefix** | Kullanim: owl prefix <1-16 harf/rakam>`,
      SuppressionKeys.usage('prefix'),
    );
    return;
  }
  const newPrefix = await setGuildPrefix(ctx.redis, message.guildId, value);
  await message.reply(`✅ **Prefix Guncellendi** 🎉\nYeni prefix: \`${newPrefix}\`\nOrnek: \`${newPrefix} hunt\``);
}

// ─── Slash: /owl prefix ───────────────────────────────────────────────────────

export async function runPrefix(
  interaction: Parameters<CommandDefinition['execute']>[0],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({ embeds: [failEmbed('Hata', 'Bu komut sadece sunucuda kullanilabilir.')], flags: 64 });
    return;
  }
  const hasAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
  if (!hasAdmin) {
    await interaction.reply({ embeds: [failEmbed('Yetki', 'Prefix ayari icin yonetici yetkisi gerekir.')], flags: 64 });
    return;
  }
  const value = interaction.options.getString('deger', true).trim().toLowerCase();
  if (!/^[a-z0-9]{1,16}$/i.test(value)) {
    await interaction.reply({
      embeds: [failEmbed('Gecersiz Prefix', 'Prefix 1-16 karakter olmali ve sadece harf/rakam icermeli.')],
      flags: 64,
    });
    return;
  }
  const newPrefix = await setGuildPrefix(ctx.redis, interaction.guildId, value);
  const { successEmbed: se } = await import('../utils/embed.js');
  await interaction.reply({
    embeds: [se('Prefix Guncellendi', `Yeni prefix: \`${newPrefix}\`\nOrnek: \`${newPrefix} hunt\``)],
    flags: 64,
  });
}

// ─── aç (lootbox envanteri görüntüleme) ──────────────────────────────────────

export async function runAcMessage(
  message: Message,
  args: string[],
  ctx: Parameters<CommandDefinition['execute']>[1],
  helpPrefix: string,
): Promise<void> {
  const boxes = await listLootboxInventory(ctx.prisma, message.author.id);
  const pity  = await getPityCounts(ctx.redis as unknown as Redis, message.author.id);

  if (boxes.length === 0) {
    await message.reply(
      `📦 **Envanterinde hiç kutu yok.**\n` +
      `> Hunt, PvP veya encounter'dan otomatik düşer.\n` +
      `> \`${helpPrefix} sk\` — silah kutusu aç\n` +
      `> \`${helpPrefix} ek\` — eşya kutusu aç`,
    );
    return;
  }

  const lines = boxes.map(({ def, quantity }) => {
    const p = pity[def.id] ?? 0;
    return `${displayLootboxEmoji(def)} **${def.name}** ×${quantity}  *(pity: ${p}/${def.pityThreshold})*`;
  });

  await message.reply(
    `📦 **Kutu Envanteri**\n\n${lines.join('\n')}\n\n` +
    `> \`${helpPrefix} sk\` / \`${helpPrefix} sk all\` — silah kutusu aç\n` +
    `> \`${helpPrefix} ek\` / \`${helpPrefix} ek all\` — eşya kutusu aç`,
  );
}

// ─── sk (silah kutusu açma) ───────────────────────────────────────────────────

export async function runSkMessage(
  message: Message,
  args: string[],
  ctx: Parameters<CommandDefinition['execute']>[1],
  helpPrefix: string,
): Promise<void> {
  const openAll = (args[0] ?? '').toLowerCase() === 'all';
  await runCrateOpen(message, ctx, helpPrefix, 'wc', openAll);
}

// ─── ek (eşya kutusu açma) ────────────────────────────────────────────────────

export async function runEkMessage(
  message: Message,
  args: string[],
  ctx: Parameters<CommandDefinition['execute']>[1],
  helpPrefix: string,
): Promise<void> {
  const openAll = (args[0] ?? '').toLowerCase() === 'all';
  await runCrateOpen(message, ctx, helpPrefix, 'ec', openAll);
}

// ─── Ortak kutu açma mantığı ──────────────────────────────────────────────────

async function runCrateOpen(
  message: Message,
  ctx: Parameters<CommandDefinition['execute']>[1],
  helpPrefix: string,
  lootboxId: string,
  openAll: boolean,
): Promise<void> {
  const playerId = message.author.id;
  const name     = message.member?.displayName ?? message.author.username;

  try {
    if (openAll) {
      const { opened, results } = await openAllLootboxes(
        ctx.prisma,
        ctx.redis as unknown as Redis,
        playerId,
        lootboxId,
      );

      // Tüm item'ları topla ve say
      const tally = new Map<string, { emoji: string; rarity: string; count: number }>();
      for (const r of results) {
        for (const item of r.items) {
          const existing = tally.get(item.buffItemId);
          if (existing) {
            existing.count++;
          } else {
            tally.set(item.buffItemId, { emoji: item.emoji, rarity: item.rarity, count: 1 });
          }
        }
      }

      const def = LOOTBOX_DEF_MAP[lootboxId]!;
      const pityCount = results.filter((r) => r.pityTriggered).length;

      const sorted = [...tally.entries()].sort(
        (a, b) => rarityRank(b[1].rarity) - rarityRank(a[1].rarity),
      );

      const legendaryCount = sorted
        .filter(([, v]) => v.rarity === 'Legendary')
        .reduce((sum, [, v]) => sum + v.count, 0);

      const lines = sorted.map(([, v]) =>
        `${rarityDot(v.rarity)} ${v.emoji} ×${v.count}`,
      );

      let out = `${displayLootboxEmoji(def)} | **${name}** opens **${opened}x ${def.name}**\n`;
      out += lines.join('  ') || '*Hiçbir şey çıkmadı.*';
      // L3 — Legendary nadir; toplu açılışta kaybolmasın diye ayrı işaret.
      if (legendaryCount > 0) out += `\n${momentMarker('legendary')} | Legendary ×${legendaryCount}`;
      if (pityCount > 0) out += `\n✨ | Pity **${pityCount}** kez tetiklendi!`;

      const questType = lootboxId === 'wc' ? 'sk' : lootboxId === 'ec' ? 'ek' : 'lootbox_any';
      await fireQuestBatch(ctx.prisma, playerId, [
        { type: questType, amount: opened },
        { type: 'lootbox_any', amount: opened },
      ], ctx.redis);
      await message.reply(out);
    } else {
      const result = await openLootbox(
        ctx.prisma,
        ctx.redis as unknown as Redis,
        playerId,
        lootboxId,
      );

      const def  = LOOTBOX_DEF_MAP[lootboxId]!;
      const item = result.items[0];

      let out = `${displayLootboxEmoji(def)} | **${name}** bir **${def.name}** açtı\n`;
      if (item) {
        const dot = rarityDot(item.rarity);
        // L3 — Legendary tek açılışta da görsel olarak ayrışsın.
        const mark = item.rarity === 'Legendary' ? `${momentMarker('legendary')} ` : '';
        out += `🎁 | içinden ${mark}${dot} **${item.buffName}** çıktı *(${item.rarity})*`;
      } else {
        out += `🎁 | içi boş çıktı…`;
      }
      if (result.pityTriggered) out += `\n✨ | Pity garantisi tetiklendi!`;

      const questType = lootboxId === 'wc' ? 'sk' : lootboxId === 'ec' ? 'ek' : 'lootbox_any';
      await fireQuestBatch(ctx.prisma, playerId, [
        { type: questType, amount: 1 },
        { type: 'lootbox_any', amount: 1 },
      ], ctx.redis);
      await message.reply(out);
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Bir hata oluştu.';
    await message.reply(`❌ **Hata** | ${errMsg}`);
  }
}

// ─── kumar (M1 · kendi istatistiğin + şans şeffaflığı) ───────────────────────

/**
 * Oyuncunun kendi kumar kaydını ve şansını etkileyen değiştiricileri gösterir.
 *
 * M1 gereği opsiyoneldir — kimseye zorla gösterilmez, isteyen bakar.
 */
export async function runKumarStatsMessage(
  message: Message,
  _args: string[],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  const playerId = message.author.id;
  const redis = ctx.redis as unknown as Redis;

  const [stats, player] = await Promise.all([
    getGambleStats(redis, playerId),
    ctx.prisma.player.findUnique({
      where: { id: playerId },
      select: { coins: true, gambleStreakWins: true, gambleStreakLosses: true },
    }),
  ]);

  const embed = buildGambleStatsEmbed({
    username: message.member?.displayName ?? message.author.username,
    stats,
    coins: player?.coins ?? 0,
    streakWins: player?.gambleStreakWins ?? 0,
    streakLosses: player?.gambleStreakLosses ?? 0,
  });

  await message.reply({ embeds: [embed] });
}

// ─── kudos / mentor ───────────────────────────────────────────────────────────

function resolveKudosTarget(message: Message, args: string[]): { id: string; bot: boolean } | null {
  const mentioned = message.mentions.users.first();
  if (mentioned) return { id: mentioned.id, bot: mentioned.bot };

  for (const arg of args) {
    const match = /^<@!?(\d+)>$/.exec(arg);
    const id = match?.[1] ?? (/^\d{17,20}$/.test(arg) ? arg : null);
    if (id) return { id, bot: false };
  }
  return null;
}

export async function runKudosMessage(
  message: Message,
  args: string[],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  const { sendKudos, getKudosPeople, formatKudosCooldown } = await import('../systems/kudos');
  const target = resolveKudosTarget(message, args);

  if (!target) {
    const people = await getKudosPeople(ctx.redis, message.author.id);
    await message.reply(people > 0 ? `🦉 **${people}** kişi sana kudos attı` : '🦉 Henüz kudos yok');
    return;
  }
  if (target.bot) {
    await message.reply('Oyuncu değil.');
    return;
  }

  const result = await sendKudos(ctx.redis, message.author.id, target.id);
  if (!result.ok && result.reason === 'self') {
    await message.reply('Kendine kudos gönderemezsin.');
    return;
  }
  if (!result.ok) {
    await message.reply(`⏳ ${formatKudosCooldown(result.retryAfterMs ?? 0)}`);
    return;
  }
  await message.reply(`🦉 <@${target.id}> · **${result.people}** kişi`);
}

export async function runMentorMessage(
  message: Message,
  args: string[],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  const { offerMentorship, claimMentor, getMentorFor } = await import('../systems/mentor');
  const sub = (args[0] ?? '').toLowerCase();
  if (sub === 'ol') {
    await offerMentorship(ctx.redis, message.author.id);
    await message.reply('🦉 Mentor listesine eklendin. Yeni bir avcı seni seçebilir.');
    return;
  }
  if (sub === 'iste') {
    const pair = await claimMentor(ctx.redis, ctx.prisma, message.author.id);
    if (!pair) {
      await message.reply('Şu an açık mentor yok veya penceren kapandı (ilk 7 gün).');
      return;
    }
    await message.reply(`🦉 Mentorum: <@${pair.mentorId}>`);
    return;
  }
  const mentorId = await getMentorFor(ctx.redis, message.author.id);
  await message.reply(
    mentorId
      ? `Mentorum: <@${mentorId}>`
      : '`w mentor ol` — rehber ol · `w mentor iste` — rehber iste',
  );
}

// ─── telafi (rebalance compensation claim) ───────────────────────────────────

export async function runTelafiMessage(
  message: Message,
  _args: string[],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  const playerId = message.author.id;
  const pending = await getPendingCompensation(ctx.prisma, playerId);

  if (!pending) {
    await message.reply({
      embeds: [failEmbed('Telafi', 'Bekleyen telafi paketin yok veya süresi dolmuş.')],
    });
    return;
  }

  const daysLeft = daysUntilExpiry(pending.expiresAt);
  const result = await claimRebalanceCompensation(
    ctx.prisma,
    playerId,
    ctx.redis as unknown as Redis,
  );

  if (!result.ok) {
    await message.reply({ embeds: [failEmbed('Telafi', result.message)] });
    return;
  }

  await message.reply({
    embeds: [
      successEmbed(
        'Telafi Paketi',
        `${result.message}\n\n⏳ Kalan süre claim öncesi: **${daysLeft}** gün`,
      ),
    ],
  });
}

