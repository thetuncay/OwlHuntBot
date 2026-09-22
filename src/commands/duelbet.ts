/**
 * duelbet.ts — Bahisli Düello (PvP escrow + simulatePvP)
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  type Message,
  type TextChannel,
} from 'discord.js';
import type { CommandContext } from '../types';
import { formatCoinLabel } from '../config/ui-emojis';
import { formatNumber } from '../utils/format';
import {
  createDuelBetInvite,
  deleteDuelBetInvite,
  getDuelBetInvite,
  runDuelBetBattle,
} from '../systems/gamble/duel-bet';
import { DUELBET_COOLDOWN_MS, DUELBET_INVITE_TTL_MS, DUELBET_MIN_BET, XP_PVP_LOSE } from '../config';
import { armCooldown, peekCooldown } from '../middleware/cooldown-manager';
import { buildCooldownMessage } from '../utils/command-error';
import { replyWithSuppression, SuppressionKeys } from '../utils/guarded-discord';
import { resolveGambleBetFromArgs } from '../systems/gamble/resolve-bet-args';
import { getOwlPrimaryName } from '../utils/owl-display';
import { animatePvPMessage, loadPvpDuelOwlProfiles, type PvpBattleData } from '../utils/pvp-ux';

function duelbetCooldownKey(userId: string): string {
  return `cooldown:duelbet:${userId}`;
}

export function buildDuelbetInviteContent(
  defenderId: string,
  challengerName: string,
  bet: number,
  challengerPower: number,
  challengerStreak: number,
): string {
  return [
    `⚔️ <@${defenderId}> bahisli düelloya davetlisin! 🦉`,
    `> **${challengerName}** seni bekliyor...`,
    `> Bahis: ${formatCoinLabel(bet)}`,
    `> 🏆 Toplam pot: ${formatCoinLabel(bet * 2)}`,
    `> 👤 **${challengerName}** · ⚡ Güç **${formatNumber(challengerPower)}** · 🔥 Seri **${challengerStreak}**`,
  ].join('\n');
}

function buildInviteRow(inviteId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`duelbet_accept:${inviteId}`)
      .setLabel('✅ Kabul')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`duelbet_reject:${inviteId}`)
      .setLabel('❌ Reddet')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`duelbet_cancel:${inviteId}`)
      .setLabel('🚫 İptal')
      .setStyle(ButtonStyle.Secondary),
  );
}

async function fetchChallengerStats(
  ctx: CommandContext,
  challengerId: string,
): Promise<{ power: number; streak: number }> {
  const player = await ctx.prisma.player.findUnique({
    where: { id: challengerId },
    select: { powerScore: true, pvpStreak: true },
  });
  return { power: player?.powerScore ?? 0, streak: player?.pvpStreak ?? 0 };
}

async function getMainOwlBattleName(
  prisma: CommandContext['prisma'],
  userId: string,
  fallback: string,
): Promise<string> {
  const owl = await prisma.owl.findFirst({
    where: { ownerId: userId, isMain: true },
    select: { species: true, nickname: true, hp: true, hpMax: true },
  });
  return owl ? getOwlPrimaryName(owl, fallback) : fallback;
}

async function runDuelBetInviteFlow(
  ctx: CommandContext,
  challengerId: string,
  challengerName: string,
  defenderId: string,
  defenderName: string,
  bet: number,
  postInvite: (content: string, components: ActionRowBuilder<ButtonBuilder>[]) => Promise<Message>,
): Promise<void> {
  const challengerCd = await peekCooldown(ctx.redis, duelbetCooldownKey(challengerId));
  if (challengerCd.active) {
    throw new Error(buildCooldownMessage(challengerCd.remainingMs, 'pvp_gamble', challengerName));
  }

  let invite;
  try {
    invite = await createDuelBetInvite(ctx.prisma, ctx.redis, challengerId, defenderId, bet);
  } catch (err) {
    throw err instanceof Error ? err : new Error('Davet oluşturulamadı.');
  }

  const stats = await fetchChallengerStats(ctx, challengerId);
  const inviteMsg = await postInvite(
    buildDuelbetInviteContent(defenderId, challengerName, bet, stats.power, stats.streak),
    [buildInviteRow(invite.inviteId)],
  );

  const collector = inviteMsg.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: DUELBET_INVITE_TTL_MS,
  });

  collector.on('collect', async (i) => {
    const [action, inviteId] = i.customId.split(':');
    if (inviteId !== invite.inviteId) return;

    if (action === 'duelbet_cancel' && i.user.id !== challengerId) {
      await i.reply({ content: '❌ Bu butonu sadece daveti atan kullanabilir.', flags: 64 });
      return;
    }
    if ((action === 'duelbet_accept' || action === 'duelbet_reject') && i.user.id !== defenderId) {
      await i.reply({ content: '❌ Bu buton sana ait değil.', flags: 64 });
      return;
    }

    collector.stop(action ?? 'unknown');

    if (action === 'duelbet_reject') {
      await deleteDuelBetInvite(ctx.redis, invite.inviteId);
      await i.update({
        content: `🚫 **${defenderName}** bahisli düelloyu reddetti.`,
        components: [],
      });
      return;
    }

    if (action === 'duelbet_cancel') {
      await deleteDuelBetInvite(ctx.redis, invite.inviteId);
      await i.update({
        content: `🚫 Bahisli düello iptal edildi.`,
        components: [],
      });
      return;
    }

    if (action === 'duelbet_accept') {
      await i.update({
        content: `⚔️ **Savaş başlıyor...**`,
        components: [],
      });

      const stored = await getDuelBetInvite(ctx.redis, invite.inviteId);
      if (!stored) {
        await (inviteMsg.channel as TextChannel).send({ content: '❌ Davet süresi dolmuş veya geçersiz.' });
        return;
      }
      await deleteDuelBetInvite(ctx.redis, invite.inviteId);

      try {
        const result = await runDuelBetBattle(ctx.prisma, ctx.redis, stored, inviteMsg.guildId);

        await Promise.all([
          armCooldown(ctx.redis, duelbetCooldownKey(challengerId), DUELBET_COOLDOWN_MS),
          armCooldown(ctx.redis, duelbetCooldownKey(defenderId), DUELBET_COOLDOWN_MS),
        ]);

        const [challengerBattleName, defenderBattleName] = await Promise.all([
          getMainOwlBattleName(ctx.prisma, challengerId, challengerName),
          getMainOwlBattleName(ctx.prisma, defenderId, defenderName),
        ]);

        const battleData: PvpBattleData = {
          challengerId,
          challengerName: challengerBattleName,
          challengerHpMax: result.battle.challengerHpMax,
          defenderId,
          defenderName: defenderBattleName,
          defenderHpMax: result.battle.defenderHpMax,
          events: result.battle.events,
          winnerId: result.winnerId,
          loserId: result.loserId,
          totalTurns: result.battle.turns,
          winnerXP: result.battle.winnerXP,
          loserXP: XP_PVP_LOSE,
          streak: result.battle.streak,
          xpByPlayerId: result.battle.xpByPlayerId,
          duelBet: {
            bet: result.bet,
            pot: result.bet * 2,
            netGain: result.bet,
          },
        };
        const profiles = await loadPvpDuelOwlProfiles(
          ctx.prisma,
          challengerId,
          defenderId,
          challengerBattleName,
          defenderBattleName,
        );
        battleData.challengerOwl = profiles.challenger;
        battleData.defenderOwl = profiles.defender;

        void animatePvPMessage(inviteMsg, battleData).catch(() => null);
      } catch (err) {
        await (inviteMsg.channel as TextChannel).send({
          content: `❌ **Düello Hatası** — ${err instanceof Error ? err.message : 'Beklenmeyen hata.'}`,
        });
      }
    }
  });

  collector.on('end', async (_, reason) => {
    if (reason === 'time') {
      await deleteDuelBetInvite(ctx.redis, invite.inviteId);
      await inviteMsg.edit({
        content: `⏰ Davet süresi doldu.`,
        components: [],
      }).catch(() => null);
    }
  });
}

function resolveTarget(message: Message, args: string[]): { id: string; name: string } | null {
  const mentioned = message.mentions.users.first();
  if (mentioned) return { id: mentioned.id, name: mentioned.displayName ?? mentioned.username };
  for (const arg of args) {
    const match = /^<@!?(\d+)>$/.exec(arg);
    if (match?.[1]) return { id: match[1], name: arg };
    if (/^\d{17,20}$/.test(arg)) return { id: arg, name: arg };
  }
  return null;
}

export async function runDuelBetMessage(
  message: Message,
  args: string[],
  ctx: CommandContext,
): Promise<void> {
  const target = resolveTarget(message, args);

  if (!target) {
    await replyWithSuppression(
      message,
      '❌ Kullanım: `owl duelbet @oyuncu <bahis|all>`',
      SuppressionKeys.usage('duelbet', 'format'),
    );
    return;
  }

  const resolved = await resolveGambleBetFromArgs(ctx.prisma, ctx.redis, message.author.id, args);
  if (!resolved.ok) {
    await replyWithSuppression(
      message,
      resolved.hasToken ? `❌ ${resolved.message}` : '❌ Kullanım: `owl duelbet @oyuncu <bahis|all>`',
      SuppressionKeys.usage('duelbet', 'format'),
    );
    return;
  }

  const bet = resolved.bet;
  const authorName = message.member?.displayName ?? message.author.username;
  try {
    await runDuelBetInviteFlow(
      ctx,
      message.author.id,
      authorName,
      target.id,
      target.name,
      bet,
      (content, components) => message.reply({ content, components }),
    );
  } catch (err) {
    await replyWithSuppression(
      message,
      `❌ ${err instanceof Error ? err.message : 'Davet oluşturulamadı.'}`,
      SuppressionKeys.pvp('duelbet-offer'),
    );
  }
}
