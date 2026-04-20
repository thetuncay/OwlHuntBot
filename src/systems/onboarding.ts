import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Message,
} from 'discord.js';
import type { CommandContext } from '../types';

const REGISTER_BUTTON_PREFIX = 'register_accept';
const STARTER_SPECIES = 'Kukumav baykusu';
const STARTER_TIER = 8;
const STARTER_HP = 100;

function termsText(): string {
  return [
    '🎮 **Oyuna hos geldin!** Baslamak icin kullanim sartlarini onaylamalisin.',
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
  if (await hasMainOwl(ctx, interaction.user.id)) return true;
  await interaction.reply({
    content: termsText(),
    components: [registrationRow(interaction.user.id, interaction.guildId)],
    flags: 64,
  });
  return false;
}

export async function ensureRegisteredForMessage(
  message: Message,
  ctx: CommandContext,
): Promise<boolean> {
  if (!message.guildId) return false;
  if (await hasMainOwl(ctx, message.author.id)) return true;
  await message.reply({
    content: `${termsText()}\n\n✅ Onaydan sonra tekrar komut kullanabilirsin.`,
    components: [registrationRow(message.author.id, message.guildId)],
  });
  return false;
}

export function isRegistrationButton(customId: string): boolean {
  return customId.startsWith(`${REGISTER_BUTTON_PREFIX}:`);
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
        },
        select: { id: true },
      });
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
  });

  await interaction.update({
    content: '✅ **Kaydin tamamlandi!** 🎉\n\nArtik oyuna baslayabilirsin. Dene: `owl hunt` 🦉',
    components: [],
  });
}
