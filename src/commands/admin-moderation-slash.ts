/**
 * Admin moderasyon slash komutları — /admin-uyari, /admin-ban, …
 * (Discord API: /admin ile grup komutları karıştırılamaz; prefix: w admin uyari)
 */

import { SlashCommandBuilder } from 'discord.js';
import type { CommandDefinition } from '../types';
import { isAdmin } from '../utils/admin-access';
import {
  executeModerationBan,
  executeModerationBanlist,
  executeModerationClearWarnings,
  executeModerationUnban,
  executeModerationWarn,
  executeModerationWarnings,
} from './admin-moderation';

function actorFrom(
  interaction: Parameters<CommandDefinition['execute']>[0],
  ctx: Parameters<CommandDefinition['execute']>[1],
) {
  return {
    redis: ctx.redis,
    client: interaction.client,
    issuerId: interaction.user.id,
  };
}

async function guardAdmin(
  interaction: Parameters<CommandDefinition['execute']>[0],
): Promise<boolean> {
  if (isAdmin(interaction.user.id)) return true;
  await interaction.reply({
    content: '❌ Bu komutu sadece bot admin kullanabilir.',
    flags: 64,
  });
  return false;
}

const adminUyari: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('admin-uyari')
    .setDescription('Oyuncuya uyarı ver (eşik dolunca otomatik ban)')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('kullanici').setDescription('Oyuncu').setRequired(true))
    .addStringOption((o) => o.setName('sebep').setDescription('Uyarı sebebi').setRequired(true)),
  async execute(interaction, ctx) {
    if (!await guardAdmin(interaction)) return;
    const user = interaction.options.getUser('kullanici', true);
    const sebep = interaction.options.getString('sebep', true);
    const content = await executeModerationWarn(actorFrom(interaction, ctx), user.id, sebep);
    await interaction.reply({ content, flags: 64 });
  },
};

const adminBan: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('admin-ban')
    .setDescription('Oyuncuyu bota erişimden engelle')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('kullanici').setDescription('Oyuncu').setRequired(true))
    .addStringOption((o) => o.setName('sebep').setDescription('Engelleme sebebi').setRequired(false))
    .addIntegerOption((o) =>
      o.setName('sure_dk').setDescription('Geçici ban (dakika); boş = kalıcı').setRequired(false).setMinValue(1),
    ),
  async execute(interaction, ctx) {
    if (!await guardAdmin(interaction)) return;
    const user = interaction.options.getUser('kullanici', true);
    const sebep = interaction.options.getString('sebep') ?? 'Sebep belirtilmedi';
    const sureDk = interaction.options.getInteger('sure_dk');
    const content = await executeModerationBan(actorFrom(interaction, ctx), user.id, sebep, sureDk);
    await interaction.reply({ content, flags: 64 });
  },
};

const adminUnban: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('admin-unban')
    .setDescription('Oyuncunun bot engelini kaldır')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('kullanici').setDescription('Oyuncu').setRequired(true)),
  async execute(interaction, ctx) {
    if (!await guardAdmin(interaction)) return;
    const user = interaction.options.getUser('kullanici', true);
    const content = await executeModerationUnban(actorFrom(interaction, ctx), user.id);
    await interaction.reply({ content, flags: 64 });
  },
};

const adminDurum: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('admin-durum')
    .setDescription('Oyuncunun uyarı geçmişini gör')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('kullanici').setDescription('Oyuncu').setRequired(true)),
  async execute(interaction, ctx) {
    if (!await guardAdmin(interaction)) return;
    const user = interaction.options.getUser('kullanici', true);
    const content = await executeModerationWarnings(actorFrom(interaction, ctx), user.id);
    await interaction.reply({ content, flags: 64 });
  },
};

const adminSifirla: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('admin-sifirla')
    .setDescription('Oyuncunun aktif uyarı sayacını sıfırla')
    .setDMPermission(false)
    .addUserOption((o) => o.setName('kullanici').setDescription('Oyuncu').setRequired(true)),
  async execute(interaction, ctx) {
    if (!await guardAdmin(interaction)) return;
    const user = interaction.options.getUser('kullanici', true);
    const content = await executeModerationClearWarnings(actorFrom(interaction, ctx), user.id);
    await interaction.reply({ content, flags: 64 });
  },
};

const adminBanlist: CommandDefinition = {
  data: new SlashCommandBuilder()
    .setName('admin-banlist')
    .setDescription('Engellenen oyuncuları listele')
    .setDMPermission(false),
  async execute(interaction, ctx) {
    if (!await guardAdmin(interaction)) return;
    const content = await executeModerationBanlist(actorFrom(interaction, ctx));
    await interaction.reply({ content, flags: 64 });
  },
};

/** deploy + bot yükleyici tarafından okunur */
export const extraCommands: CommandDefinition[] = [
  adminUyari,
  adminBan,
  adminUnban,
  adminDurum,
  adminSifirla,
  adminBanlist,
];
