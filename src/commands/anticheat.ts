import { SlashCommandBuilder } from 'discord.js';
import type { CommandDefinition } from '../types';
import { isAdmin } from '../utils/admin-access';
import { getCaptchaDebugInfo, formatCaptchaStrikeBar, resetCaptchaGateState, getChallengeGraceTtlSec, hasChallengePassGrace } from '../anticheat/challenge-manager';
import { CHALLENGE_TRUST_THRESHOLD } from '../anticheat/config';
import { setTrustScoreCache } from '../anticheat/trust-score';

const data = new SlashCommandBuilder()
  .setName('anticheat')
  .setDescription('Anti-cheat moderasyon araçları')
  .setDMPermission(false)
  .addSubcommand((s) =>
    s
      .setName('review')
      .setDescription('Kullanıcının anti-cheat özetini göster')
      .addUserOption((o) => o.setName('kullanici').setDescription('Kullanici').setRequired(true)),
  )
  .addSubcommand((s) =>
    s
      .setName('override')
      .setDescription('Trust/violation override uygula')
      .addUserOption((o) => o.setName('kullanici').setDescription('Kullanici').setRequired(true))
      .addIntegerOption((o) => o.setName('trust').setDescription('0-100 trust').setRequired(false).setMinValue(0).setMaxValue(100))
      .addIntegerOption((o) => o.setName('violation').setDescription('violation count').setRequired(false).setMinValue(0))
      .addBooleanOption((o) => o.setName('clear_throttle').setDescription('throttle temizle').setRequired(false))
      .addBooleanOption((o) =>
        o.setName('clear_grace').setDescription('captcha grace/oturum sıfırla (test için)').setRequired(false),
      ),
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

  if (sub === 'review') {
    const [trust, events, punishments, captchaDebug, captchaStrikes] = await Promise.all([
      ctx.prisma.anticheatTrust.findUnique({ where: { userId: user.id } }),
      ctx.prisma.anticheatEvent.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      ctx.prisma.anticheatPunishment.findMany({
        where: { userId: user.id },
        orderBy: { issuedAt: 'desc' },
        take: 5,
      }),
      getCaptchaDebugInfo(ctx.redis, user.id),
      ctx.redis.get(`ac:captcha:strikes:${user.id}`),
    ]);

    const trustText = trust
      ? `trust=${trust.trustScore}, violation=${trust.violationCount}, throttled=${trust.isRewardThrottled ? 'evet' : 'hayır'}`
      : 'trust kaydı yok';
    const strikeCount = captchaStrikes ? Number.parseInt(captchaStrikes, 10) || 0 : 0;
    const graceTtl = await getChallengeGraceTtlSec(ctx.redis, user.id);
    const graceText = graceTtl > 0
      ? `aktif (**${Math.ceil(graceTtl / 60)} dk** kaldı — captcha atlanır)`
      : 'yok';
    const captchaText = captchaDebug
      ? `aktif captcha: **${captchaDebug.answer}** (${captchaDebug.codeLength} karakter) · bitiş <t:${Math.floor(captchaDebug.expiresAt / 1000)}:R> · yanlış=${captchaDebug.wrongAttempts}`
      : 'aktif captcha yok';
    const eventLines =
      events.length > 0
        ? events
            .map((r) => `• ${r.eventType} (sev=${r.severity}) — <t:${Math.floor(r.createdAt.getTime() / 1000)}:R>`)
            .join('\n')
        : '• event yok';
    const punishmentLines =
      punishments.length > 0
        ? punishments
            .map((p) => `• Tier ${p.tier} — ${p.reason} — <t:${Math.floor(p.issuedAt.getTime() / 1000)}:R>`)
            .join('\n')
        : '• ceza yok';

    await interaction.reply({
      content:
        `🛡️ **AntiCheat Review** — <@${user.id}>\n\n` +
        `**Trust:** ${trustText}\n` +
        `**Captcha:** ${captchaText}\n` +
        `**Captcha grace:** ${graceText}\n` +
        `**Captcha strike:** ${formatCaptchaStrikeBar(strikeCount)}\n\n` +
        `**Aktif/Son Cezalar:**\n${punishmentLines}\n\n` +
        `**Son 20 Event:**\n${eventLines}`,
      flags: 64,
    });
    return;
  }

  const trustScore = interaction.options.getInteger('trust');
  const violationCount = interaction.options.getInteger('violation');
  const clearThrottle = interaction.options.getBoolean('clear_throttle') ?? false;
  const clearGraceExplicit = interaction.options.getBoolean('clear_grace');
  const clearGrace =
    clearGraceExplicit === true
    || (clearGraceExplicit !== false
      && trustScore != null
      && trustScore <= CHALLENGE_TRUST_THRESHOLD);

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
        source: 'slash_anticheat',
        actor: interaction.user.id,
        override: { trustScore, violationCount, clearThrottle, clearGrace },
      },
    },
  });

  await setTrustScoreCache(ctx.redis, user.id, row.trustScore);
  if (clearGrace) {
    await resetCaptchaGateState(ctx.redis, user.id);
  }

  const graceAfter = clearGrace ? false : await hasChallengePassGrace(ctx.redis, user.id);

  await interaction.reply({
    content:
      `✅ **AntiCheat override uygulandı** — <@${user.id}>\n` +
      `• trustScore: **${row.trustScore}**\n` +
      `• violationCount: **${row.violationCount}**\n` +
      `• isRewardThrottled: **${row.isRewardThrottled ? 'evet' : 'hayır'}**\n` +
      `• captchaGrace: **${graceAfter ? 'aktif (captcha atlanır)' : 'yok'}**` +
      (clearGrace ? '\n• captcha grace/oturum **sıfırlandı**' : ''),
    flags: 64,
  });
}

export default { data, execute } satisfies CommandDefinition;
