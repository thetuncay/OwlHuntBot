import { EmbedBuilder, type Message } from 'discord.js';
import type { CommandContext } from '../types';
import { claimDailyLogin, formatDailyLoginStatus } from '../systems/daily-login';
import { formatNewbieBoostLine } from '../systems/newbie-boost';
import { failEmbed } from '../utils/embed';
import { buildRewardClaimMessage } from '../utils/result-ux';
import { LOOTBOX_DEF_MAP } from '../config';
import { buildWelcomeBackMessage, claimWelcomeBack } from '../systems/welcome-back';
import { recordReturnD1 } from '../systems/engagement-metrics';

function formatWait(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  const mins = Math.ceil((ms % 3_600_000) / 60_000);
  if (hours > 0) return `${hours} saat ${mins} dk`;
  return `${mins} dk`;
}

export async function runDailyLoginMessage(
  message: Message,
  _args: string[],
  ctx: CommandContext,
  prefix: string,
): Promise<void> {
  const userId = message.author.id;
  const player = await ctx.prisma.player.findUnique({
    where: { id: userId },
    select: {
      loginStreak: true,
      lastDailyClaimAt: true,
      createdAt: true,
    },
  });

  if (!player) {
    await message.reply({ embeds: [failEmbed('Günlük Ödül', 'Önce kayıt olmalısın.')] });
    return;
  }

  const status = formatDailyLoginStatus(player.loginStreak, player.lastDailyClaimAt);
  if (!status.canClaim) {
    const graceLabel =
      status.graceRemainingMs > 0
        ? `\n🛟 Seri koruma: **${formatWait(status.graceRemainingMs)}**`
        : '';
    const embed = new EmbedBuilder()
      .setTitle('🎁 Günlük hediye')
      .setColor(0x95a5a6)
      .setDescription(
        `🔥 Seri: **${player.loginStreak}** gün\n` +
        `⏱️ Sıradaki: **${formatWait(status.remainingMs)}**` +
        graceLabel,
      );
    const newbieLine = formatNewbieBoostLine(player.createdAt);
    if (newbieLine) embed.setFooter({ text: newbieLine });
    await message.reply({ embeds: [embed] });
    return;
  }

  // A7 — paket ödül verilmeden hesaplanır: `claimDailyLogin` lastDailyClaimAt'i
  // günceller, sonrasında ara süresi ölçülemez.
  const welcomeBack = await claimWelcomeBack(
    ctx.prisma,
    ctx.redis,
    userId,
    player.lastDailyClaimAt,
  ).catch(() => null);

  try {
    const reward = await claimDailyLogin(ctx.prisma, ctx.redis, userId);
    const ecEmoji = LOOTBOX_DEF_MAP.ec?.emoji ?? '🧰';
    const wcEmoji = LOOTBOX_DEF_MAP.wc?.emoji ?? '⚔️';

    const extras: string[] = [];
    if (welcomeBack) {
      extras.push(buildWelcomeBackMessage(welcomeBack));
    }
    if (reward.equipmentCrate > 0) {
      extras.push(`${ecEmoji} ${reward.equipmentCrate}× Eşya Kutusu`);
    }
    if (reward.weaponCrate > 0) {
      extras.push(`${wcEmoji} ${reward.weaponCrate}× Silah Kutusu`);
    }
    extras.push(`🔥 Seri **${reward.streak}** · sıradaki ${formatWait(reward.nextClaimAt.getTime() - Date.now())}`);
    if (reward.equipmentCrate > 0 || reward.weaponCrate > 0) {
      extras.push(`💡 \`${prefix} ek\` · \`${prefix} sk\``);
    }
    const newbieLine = formatNewbieBoostLine(player.createdAt);
    if (newbieLine) extras.push(newbieLine);
    await recordReturnD1(ctx.redis).catch(() => undefined);

    const text = buildRewardClaimMessage({
      headline: '🎁 Günlük hediye',
      xp: reward.xp,
      coin: reward.coins,
      level: reward.levelAfter,
      currentXp: reward.xpAfter,
      extras,
    });

    await message.reply(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Günlük ödül alınamadı.';
    await message.reply({ embeds: [failEmbed('Günlük Ödül', msg)] });
  }
}
