import { SlashCommandBuilder } from 'discord.js';
import type { CommandDefinition } from '../types';
import { isAdmin } from '../utils/admin-access';

const data = new SlashCommandBuilder()
  .setName('admin-anticheat')
  .setDescription('Anti-cheat admin araçları')
  .setDMPermission(false)
  .addSubcommand((s) =>
    s
      .setName('trust')
      .setDescription('Kullanıcının trust durumunu göster')
      .addUserOption((o) => o.setName('kullanici').setDescription('Kullanici').setRequired(true)),
  )
  .addSubcommand((s) =>
    s
      .setName('override')
      .setDescription('Trust override uygula')
      .addUserOption((o) => o.setName('kullanici').setDescription('Kullanici').setRequired(true))
      .addIntegerOption((o) => o.setName('trust').setDescription('0-100 trust').setRequired(false).setMinValue(0).setMaxValue(100))
      .addIntegerOption((o) => o.setName('violation').setDescription('violation count').setRequired(false).setMinValue(0))
      .addBooleanOption((o) => o.setName('clear_throttle').setDescription('throttle temizle').setRequired(false)),
  )
  .addSubcommand((s) =>
    s
      .setName('events')
      .setDescription('Son anticheat eventleri göster')
      .addUserOption((o) => o.setName('kullanici').setDescription('Kullanici').setRequired(true)),
  );

async function execute(
  interaction: Parameters<CommandDefinition['execute']>[0],
  ctx: Parameters<CommandDefinition['execute']>[1],
): Promise<void> {
  if (!isAdmin(interaction.user.id)) {
    await interaction.reply({ content: '❌ Bu komutu sadece bot admin kullanabilir.', flags: 64 });
    return;
  }

  const sub = interaction.options.getSubcommand(true);
  const user = interaction.options.getUser('kullanici', true);

  if (sub === 'trust') {
    const trust = await ctx.prisma.anticheatTrust.findUnique({ where: { userId: user.id } });
    if (!trust) {
      await interaction.reply({ content: `ℹ️ <@${user.id}> için trust kaydı yok.`, flags: 64 });
      return;
    }
    await interaction.reply({
      content:
        `🛡️ **AntiCheat Trust** — <@${user.id}>\n` +
        `• trustScore: **${trust.trustScore}**\n` +
        `• violationCount: **${trust.violationCount}**\n` +
        `• lastViolationAt: ${trust.lastViolationAt ? `<t:${Math.floor(trust.lastViolationAt.getTime() / 1000)}:F>` : '—'}\n` +
        `• isRewardThrottled: **${trust.isRewardThrottled ? 'evet' : 'hayır'}**`,
      flags: 64,
    });
    return;
  }

  if (sub === 'events') {
    const rows = await ctx.prisma.anticheatEvent.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    if (rows.length === 0) {
      await interaction.reply({ content: `ℹ️ <@${user.id}> için event yok.`, flags: 64 });
      return;
    }
    const lines = rows.map(
      (r) =>
        `• ${r.eventType} (sev=${r.severity}) — <t:${Math.floor(r.createdAt.getTime() / 1000)}:R>`,
    );
    await interaction.reply({
      content: `📜 **Son AntiCheat Eventleri** — <@${user.id}>\n\n${lines.join('\n')}`,
      flags: 64,
    });
    return;
  }

  const trustScore = interaction.options.getInteger('trust');
  const violationCount = interaction.options.getInteger('violation');
  const clearThrottle = interaction.options.getBoolean('clear_throttle') ?? false;

  const row = await ctx.prisma.anticheatTrust.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      trustScore: trustScore ?? 100,
      violationCount: violationCount ?? 0,
      isRewardThrottled: false,
      throttleUntil: null,
    },
    update: {
      ...(trustScore != null ? { trustScore } : {}),
      ...(violationCount != null ? { violationCount } : {}),
      ...(clearThrottle ? { isRewardThrottled: false, throttleUntil: null } : {}),
    },
  });

  await ctx.prisma.anticheatEvent.create({
    data: {
      userId: user.id,
      eventType: 'manual_review',
      severity: 1,
      detail: {
        source: 'slash_admin',
        actor: interaction.user.id,
        override: { trustScore, violationCount, clearThrottle },
      },
    },
  });

  await interaction.reply({
    content:
      `✅ **AntiCheat override uygulandı** — <@${user.id}>\n` +
      `• trustScore: **${row.trustScore}**\n` +
      `• violationCount: **${row.violationCount}**\n` +
      `• isRewardThrottled: **${row.isRewardThrottled ? 'evet' : 'hayır'}**`,
    flags: 64,
  });
}

export default { data, execute } satisfies CommandDefinition;
