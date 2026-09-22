/**
 * admin-testmoon.ts — /admin sys testmoon handler
 *
 * Ay evrimi bildirimini DB'ye dokunmadan önizler.
 */

import type { CommandDefinition } from '../types';
import { getMoonTierDef } from '../config/owl-moon-tier';
import type { MoonEvolutionResult } from '../systems/owl-moon-evolution';
import { buildMoonEvolutionFollowUp } from '../utils/owl-moon-ux';
import { getGuildPrefix } from '../utils/prefix';

export async function handleTestMoon(
  interaction: Parameters<CommandDefinition['execute']>[0],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  const targetUser = interaction.options.getUser('kullanici') ?? interaction.user;
  const oldTier = interaction.options.getInteger('eski') ?? 1;
  const newTier = interaction.options.getInteger('yeni') ?? 2;
  const powerOverride = interaction.options.getInteger('guc');
  const nameOverride = interaction.options.getString('isim')?.trim();

  if (oldTier < 1 || oldTier > 6) {
    await interaction.reply({ content: '❌ `eski` 1–6 arasında olmalı.', flags: 64 });
    return;
  }
  if (newTier < 2 || newTier > 7) {
    await interaction.reply({ content: '❌ `yeni` 2–7 arasında olmalı.', flags: 64 });
    return;
  }
  if (newTier <= oldTier) {
    await interaction.reply({ content: '❌ `yeni`, `eski` kademeden büyük olmalı.', flags: 64 });
    return;
  }

  const mainOwl = await ctx.prisma.owl.findFirst({
    where: { ownerId: targetUser.id, isMain: true },
    select: { id: true, species: true, nickname: true, tier: true },
  });

  const speciesTier = interaction.options.getInteger('tur') ?? mainOwl?.tier ?? 1;
  const displayName = nameOverride
    || mainOwl?.nickname?.trim()
    || mainOwl?.species
    || 'Test Baykuş';

  const newDef = getMoonTierDef(newTier);
  const power = powerOverride ?? (newDef?.powerMin ?? 100) + 4;

  const result: MoonEvolutionResult = {
    owlId: mainOwl?.id ?? 'test-owl',
    ownerId: targetUser.id,
    speciesTier,
    displayName,
    oldMoonTier: oldTier,
    newMoonTier: newTier,
    power,
  };

  const helpPrefix = interaction.guildId
    ? (await getGuildPrefix(ctx.redis, interaction.guildId)) || 'w'
    : 'w';

  const payload = buildMoonEvolutionFollowUp(result, helpPrefix);
  const channel = interaction.channel;

  if (channel && 'send' in channel) {
    await channel.send(payload);
    await interaction.reply({
      content: `✅ Ay evrimi önizlemesi kanala gönderildi.\n` +
        `• Etiket: <@${targetUser.id}>\n` +
        `• Moon ${oldTier} → ${newTier} · tür T${speciesTier} · güç ${power}\n` +
        `*(DB'ye dokunulmadı)*`,
      flags: 64,
    });
    return;
  }

  await interaction.reply(payload);
}
