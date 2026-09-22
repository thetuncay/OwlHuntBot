import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Message,
} from 'discord.js';
import type { CommandContext } from '../types';
import { rehydratePlayerState } from '../state/player-state';
import { getPlayerSegmentHint } from '../data/player-segments';
import { getGuildPrefix } from '../utils/prefix';
import {
  buildRegistrationDiscordBlock,
  getOfficialDiscordInviteUrl,
} from '../utils/community-discord';
import { buildOwlStatWriteData } from '../utils/owl-stats';
import { initOwlMoonTierOnCreate } from './owl-moon-evolution';
import { openLootbox } from './lootbox';
import {
  DAILY_LOGIN_EQUIPMENT_CRATE_NAME,
  DAILY_LOGIN_WEAPON_CRATE_NAME,
  STARTER_PACK_EQUIPMENT_CRATES,
  STARTER_PACK_WEAPON_CRATES,
} from '../config';
import { appendCrateOpenHint } from '../utils/newbie-hints';
import { markHappyPathStart } from './happy-path';

const REGISTER_BUTTON_PREFIX = 'register_accept';
const REG_CACHE_TTL_S = Number.parseInt(process.env.REG_CACHE_TTL_S ?? '300', 10);
const STARTER_SPECIES = 'Kukumav baykusu';
const STARTER_TIER = 8;
const STARTER_HP = 100;

function termsText(): string {
  return [
    '🎮 **Oyuna hoş geldin!** Başlamak için kullanım şartlarını onaylamalısın.',
    '',
    '📜 **Kullanim Sartlari**',
    '• 🚫 Hile, bug suistimali ve ucuncu parti yardimci araclar yasaktir.',
    '• 🚫 Spam/flood ve diger oyunculari rahatsiz eden davranislar yasaktir.',
    '• 🚫 Coklu hesapla haksiz avantaj elde etmek yasaktir.',
    '• 🔒 Guvenlik acigi fark edersen yonetime bildirmelisin.',
    '• ⚠️ Kurallari ihlal eden hesaplar yaptirim alabilir.',
  ].join('\n');
}

function registrationRow(userId: string, guildId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${REGISTER_BUTTON_PREFIX}:${userId}:${guildId}`)
      .setLabel('✅ Kullanim Sartlarini Onayla')
      .setStyle(ButtonStyle.Success),
  );
}

async function hasMainOwl(ctx: CommandContext, userId: string): Promise<boolean> {
  const [player, main] = await Promise.all([
    ctx.prisma.player.findUnique({ where: { id: userId }, select: { id: true } }),
    ctx.prisma.owl.findFirst({ where: { ownerId: userId, isMain: true }, select: { id: true } }),
  ]);
  return Boolean(player && main);
}

export async function ensureRegisteredForInteraction(
  interaction: ChatInputCommandInteraction,
  ctx: CommandContext,
): Promise<boolean> {
  if (!interaction.inGuild() || !interaction.guildId) return false;
  const userId = interaction.user.id;
  const cacheKey = `reg:${userId}`;
  const cached = await ctx.redis.get(cacheKey);
  if (cached !== null) return true;
  const registered = await hasMainOwl(ctx, userId);
  if (registered) {
    await ctx.redis.set(cacheKey, '1', 'EX', REG_CACHE_TTL_S);
    return true;
  }
  await interaction.reply({
    content: termsText(),
    components: [registrationRow(userId, interaction.guildId)],
    flags: 64,
  });
  return false;
}

export async function ensureRegisteredForMessage(
  message: Message,
  ctx: CommandContext,
): Promise<boolean> {
  if (!message.guildId) return false;
  const userId = message.author.id;
  const cacheKey = `reg:${userId}`;
  const cached = await ctx.redis.get(cacheKey);
  if (cached !== null) return true;
  const registered = await hasMainOwl(ctx, userId);
  if (registered) {
    await ctx.redis.set(cacheKey, '1', 'EX', REG_CACHE_TTL_S);
    return true;
  }
  await message.reply({
    content: `${termsText()}\n\n✅ Onaydan sonra tekrar komut kullanabilirsin.`,
    components: [registrationRow(userId, message.guildId)],
  });
  return false;
}

export function isRegistrationButton(customId: string): boolean {
  return customId.startsWith(`${REGISTER_BUTTON_PREFIX}:`);
}

const ONBOARD_HINT_PREFIX = 'onboard_hint';
export const ONBOARD_OPEN_PREFIX = 'onboard_open';

export function isOnboardingOpenButton(customId: string): boolean {
  return customId.startsWith(`${ONBOARD_OPEN_PREFIX}:`);
}

export async function handleOnboardingOpenButton(
  interaction: ButtonInteraction,
  ctx: CommandContext,
): Promise<void> {
  const [, lootboxId, targetUserId] = interaction.customId.split(':');
  if (!targetUserId || interaction.user.id !== targetUserId) {
    await interaction.reply({ content: '❌ Bu buton sana ait değil.', flags: 64 });
    return;
  }
  const boxId = lootboxId === 'wc' ? 'wc' : 'ec';
  try {
    const result = await openLootbox(ctx.prisma, ctx.redis, interaction.user.id, boxId);
    const item = result.items[0];
    const lootLine = item
      ? `🎁 **${item.buffName}** *(${item.rarity})*`
      : '🎁 Kutu boş çıktı.';
    const pityLine = result.pityTriggered ? '\n✨ Pity garantisi tetiklendi!' : '';
    await interaction.reply({
      content: `✅ **${result.lootboxName}** açıldı!\n${lootLine}${pityLine}`,
      flags: 64,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Kutu açılamadı.';
    await interaction.reply({ content: `❌ ${msg}`, flags: 64 });
  }
}

export function isOnboardingHintButton(customId: string): boolean {
  return customId.startsWith(`${ONBOARD_HINT_PREFIX}:`);
}

export async function handleOnboardingHintButton(interaction: ButtonInteraction): Promise<void> {
  const hint = interaction.customId.split(':')[1];
  const guildPrefix = interaction.guildId ? 'w' : 'owl';
  const messages: Record<string, string> = {
    hunt: `🎯 İlk avın için kanala \`${guildPrefix} hunt\` yaz.`,
    stats: `🦉 Baykuşunu görmek için \`${guildPrefix} stats\` veya \`${guildPrefix} st\` yaz.`,
    help: `📖 Tüm komutlar: \`${guildPrefix} yardim\` · Kategoriler: \`${guildPrefix} yardim av\``,
  };
  await interaction.reply({
    content: messages[hint ?? ''] ?? `Komutlar: \`${guildPrefix} <komut>\``,
    flags: 64,
  });
}

export const ONBOARD_HUNT_COUNT_KEY = (userId: string) => `onboard:hunt:${userId}`;

export async function markFirstHuntComplete(redis: CommandContext['redis'], userId: string): Promise<boolean> {
  const key = ONBOARD_HUNT_COUNT_KEY(userId);
  const prev = await redis.get(key);
  await redis.incr(key);
  if (!prev) await redis.expire(key, 60 * 60 * 24 * 30);
  return prev === null;
}

export async function handleRegistrationButton(
  interaction: ButtonInteraction,
  ctx: CommandContext,
): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({ content: '❌ Bu islem sadece sunucuda gecerlidir.', flags: 64 });
    return;
  }
  const [, targetUserId, targetGuildId] = interaction.customId.split(':');
  if (!targetUserId || !targetGuildId) {
    await interaction.reply({ content: '❌ Gecersiz onay istegi.', flags: 64 });
    return;
  }
  if (interaction.user.id !== targetUserId) {
    await interaction.reply({ content: '❌ Bu buton baska bir oyuncuya ait.', flags: 64 });
    return;
  }
  if (interaction.guildId !== targetGuildId) {
    await interaction.reply({ content: '❌ Bu onay farkli bir sunucu icin olusturulmus.', flags: 64 });
    return;
  }

  const displayName = interaction.member && 'displayName' in interaction.member ? interaction.member.displayName : null;
  const guildName = interaction.guild?.name ?? 'Bilinmiyor Sunucu';

  let starterPackGranted = false;

  await ctx.prisma.$transaction(async (tx) => {
    const player = await tx.player.upsert({
      where: { id: interaction.user.id },
      create: { id: interaction.user.id },
      update: {},
    });
    const existingMain = await tx.owl.findFirst({
      where: { ownerId: interaction.user.id, isMain: true },
      select: { id: true },
    });
    if (!existingMain) {
      const starterStats = buildOwlStatWriteData({
        gaga: 11, goz: 11, kulak: 11, kanat: 11, pence: 11,
      });
      const starterPower = 11 * 5;
      const starter = await tx.owl.create({
        data: {
          ownerId: interaction.user.id,
          species: STARTER_SPECIES,
          tier: STARTER_TIER,
          quality: 'Common',
          hp: STARTER_HP,
          hpMax: STARTER_HP,
          staminaCur: STARTER_HP,
          isMain: true,
          ...starterStats,
        },
        select: { id: true },
      });
      await initOwlMoonTierOnCreate(
        tx,
        interaction.user.id,
        starter.id,
        STARTER_TIER,
        starterPower,
      );
      await tx.player.update({
        where: { id: player.id },
        data: { mainOwlId: starter.id },
      });
    }
    await tx.playerRegistration.upsert({
      where: {
        userId_guildId: {
          userId: interaction.user.id,
          guildId: interaction.guildId,
        },
      },
      create: {
        userId: interaction.user.id,
        username: interaction.user.username,
        displayName,
        guildId: interaction.guildId,
        guildName,
        acceptedAt: new Date(),
      },
      update: {
        username: interaction.user.username,
        displayName,
        guildName,
        acceptedAt: new Date(),
      },
    });

    if (!player.starterPackClaimedAt) {
      const crates: Array<{ name: string; qty: number }> = [
        { name: DAILY_LOGIN_EQUIPMENT_CRATE_NAME, qty: STARTER_PACK_EQUIPMENT_CRATES },
        { name: DAILY_LOGIN_WEAPON_CRATE_NAME, qty: STARTER_PACK_WEAPON_CRATES },
      ];
      for (const crate of crates) {
        await tx.inventoryItem.upsert({
          where: {
            ownerId_itemName: { ownerId: interaction.user.id, itemName: crate.name },
          },
          create: {
            ownerId: interaction.user.id,
            itemName: crate.name,
            itemType: 'Kutu',
            rarity: 'Common',
            quantity: crate.qty,
          },
          update: { quantity: { increment: crate.qty } },
        });
      }
      await tx.player.update({
        where: { id: player.id },
        data: { starterPackClaimedAt: new Date() },
      });
      starterPackGranted = true;
    }
  });

  await rehydratePlayerState(ctx.redis, ctx.prisma, interaction.user.id);
  await markHappyPathStart(ctx.redis, interaction.user.id).catch(() => undefined);

  const segmentHint = getPlayerSegmentHint(interaction.user.id);

  const welcomeLines = [
    '✅ **Kaydın tamamlandı!** Hoş geldin 🎉',
    '',
    '**Nasıl oynanır:** `1.` avlan → `2.` av sat → `3.` stat yükselt',
    '',
    'Aşağıdaki butonlara tıklayarak ilk komutlarını öğren.',
  ];
  if (segmentHint) {
    welcomeLines.push('', '💡 **Sana özel ipucu:**', segmentHint);
  }

  const guildPrefix = interaction.guildId
    ? await getGuildPrefix(ctx.redis, interaction.guildId)
    : 'w';

  const guideRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${ONBOARD_HINT_PREFIX}:hunt`)
      .setLabel('🎯 İlk avım')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${ONBOARD_HINT_PREFIX}:stats`)
      .setLabel('🦉 Baykuşum')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${ONBOARD_HINT_PREFIX}:help`)
      .setLabel('📖 Rehber')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${ONBOARD_OPEN_PREFIX}:ec:${interaction.user.id}`)
      .setLabel('🧰 İlk kutunu aç')
      .setStyle(ButtonStyle.Success),
  );

  const communityRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel('Resmi Discord Sunucusu')
      .setStyle(ButtonStyle.Link)
      .setURL(getOfficialDiscordInviteUrl()),
  );

  await interaction.update({
    content: welcomeLines.join('\n'),
    components: [guideRow, communityRow],
  });

  if (starterPackGranted) {
    await interaction.followUp({
      content: appendCrateOpenHint(
        `🎁 **Başlangıç paketi** envanterine eklendi: **${STARTER_PACK_EQUIPMENT_CRATES}× Eşya Kutusu** + **${STARTER_PACK_WEAPON_CRATES}× Silah Kutusu**.`,
        guildPrefix,
      ),
      flags: 64,
    }).catch(() => null);
  }

  await ctx.redis.set(`reg:${interaction.user.id}`, '1', 'EX', 60);
}
