import { type Message } from 'discord.js';
import { coinFlip } from '../systems/gambling';
import type { CommandContext } from '../types';
import { armCooldown, peekCooldown } from '../middleware/cooldown-manager';
import { GAMBLE_COINFLIP_COOLDOWN_MS } from '../config';
import { buildCooldownMessage } from '../utils/command-error';
import { notifyInflightBusy, replyWithSuppression, SuppressionKeys } from '../utils/guarded-discord';
import { acquireInFlightAction, releaseInFlightAction } from '../utils/response-suppression';
import {
  awaitCoinFlipSpin,
  buildCoinFlipResultText,
  buildCoinFlipSpinText,
  oppositeFace,
  parseCoinChoice,
  type CoinFace,
} from '../utils/coinflip-ux';
import {
  isGambleBetArgToken,
  resolveGambleBetFromArgs,
} from '../systems/gamble/resolve-bet-args';

const CF_SOLO_USAGE = '❌ Kullanım: `owl cf <miktar|all> [yazi|tura]` veya `owl cf @oyuncu <miktar|all>`';

function resolveResultFace(win: boolean, choice?: CoinFace): CoinFace {
  if (!choice) return Math.random() < 0.5 ? 'heads' : 'tails';
  return win ? choice : oppositeFace(choice);
}

async function runSoloCoinFlip(params: {
  prisma: CommandContext['prisma'];
  redis: CommandContext['redis'];
  userId: string;
  playerName: string;
  bet: number;
  choice?: CoinFace;
  startedAt: number;
  edit: (content: string) => Promise<unknown>;
  onCooldown: () => Promise<void>;
}): Promise<void> {
  const cooldownKey = `cooldown:coinflip:${params.userId}`;
  const cooldown = await peekCooldown(params.redis, cooldownKey);
  if (cooldown.active) {
    await params.onCooldown();
    return;
  }

  const [result] = await Promise.all([
    coinFlip(params.prisma, params.userId, params.bet, params.redis),
    awaitCoinFlipSpin(params.startedAt),
  ]);
  await armCooldown(params.redis, cooldownKey, GAMBLE_COINFLIP_COOLDOWN_MS);

  const resultFace = resolveResultFace(result.win, params.choice);
  await params.edit(
    buildCoinFlipResultText({
      bet: params.bet,
      playerName: params.playerName,
      win: result.win,
      resultFace,
      choice: params.choice,
      deltaCoins: result.deltaCoins,
      ...(result.lossReliefNote ? { lossReliefNote: result.lossReliefNote } : {}),
    }),
  );
}

export async function runCfMessage(
  message: Message,
  args: string[],
  ctx: CommandContext,
): Promise<void> {
  const hasMention = message.mentions.users.size > 0 || args.some((a) => /^<@!?(\d+)>$/.test(a));
  if (hasMention) {
    const { runPvpCoinFlip } = await import('./pvp.js');
    await runPvpCoinFlip(message, args, ctx);
    return;
  }

  const resolved = await resolveGambleBetFromArgs(ctx.prisma, ctx.redis, message.author.id, args);
  if (!resolved.ok) {
    await replyWithSuppression(
      message,
      resolved.hasToken ? `❌ ${resolved.message}` : CF_SOLO_USAGE,
      SuppressionKeys.usage('cf', 'solo'),
    );
    return;
  }
  const bet = resolved.bet;

  const choiceArg = args.find((a) => !isGambleBetArgToken(a) && !/^<@!?(\d+)>$/.test(a));
  const choice = parseCoinChoice(choiceArg);
  const playerName = message.member?.displayName ?? message.author.username;

  const gate = {
    userId: message.author.id,
    guildId: message.guildId,
    key: SuppressionKeys.state('cf-solo-inflight'),
  };
  if (!acquireInFlightAction(gate)) {
    await notifyInflightBusy(message, playerName, SuppressionKeys.state('cf-solo-inflight-busy'));
    return;
  }

  try {
    const startedAt = Date.now();
    const sent = await message.reply(buildCoinFlipSpinText(bet, playerName, choice));

    await runSoloCoinFlip({
      prisma: ctx.prisma,
      redis: ctx.redis,
      userId: message.author.id,
      playerName,
      bet,
      choice,
      startedAt,
      edit: (content) => sent.edit({ content }),
      onCooldown: async () => {
        const cooldown = await peekCooldown(ctx.redis, `cooldown:coinflip:${message.author.id}`);
        await sent.edit({
          content: buildCooldownMessage(cooldown.remainingMs, 'coinflip', playerName),
        });
      },
    });
  } catch (err) {
    await replyWithSuppression(
      message,
      `❌ ${err instanceof Error ? err.message : 'Hata'}`,
      SuppressionKeys.economy('cf-solo'),
    );
  } finally {
    releaseInFlightAction(gate);
  }
}
