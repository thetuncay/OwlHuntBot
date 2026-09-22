import type { Message } from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { getGuildPrefix } from '../utils/prefix';
import { resolvePrefixCommandText } from '../utils/alias-command';
import { safeReply } from '../utils/safe-reply';
import {
  buildChallengeExpiredMessage,
  buildChallengeSuccessMessage,
  buildChallengeWrongMessage,
} from './ui/challenge-components';
import {
  getActiveChallengeSession,
  hasActiveChallengeSession,
  submitChallengeAnswer,
} from './challenge-manager';
import { trySendCaptchaDm } from './captcha-delivery';
import { CAPTCHA_CODE_LENGTH, isAnticheatCaptchaEnforceEnabled, isAnticheatEnabled } from './config';

export function looksLikeCaptchaAnswer(text: string): boolean {
  if (text.length !== CAPTCHA_CODE_LENGTH) return false;
  return /^[A-Za-z0-9]+$/.test(text);
}

async function isBotCommandAttempt(message: Message, redis: Redis, content: string): Promise<boolean> {
  if (!message.guildId) return false;
  const guildPrefix = await getGuildPrefix(redis, message.guildId);
  return resolvePrefixCommandText(content, guildPrefix) !== null;
}

async function replyCaptchaResult(
  message: Message,
  result: Awaited<ReturnType<typeof submitChallengeAnswer>>,
): Promise<void> {
  let text: string;
  if (result.status === 'passed') {
    text = buildChallengeSuccessMessage(result.strikes);
  } else if (result.status === 'wrong') {
    text = buildChallengeWrongMessage(result.codeLength ?? CAPTCHA_CODE_LENGTH);
  } else {
    text = buildChallengeExpiredMessage(result.strikes);
  }

  if (message.channel?.isSendable()) {
    await message.channel.send({ content: text });
    return;
  }
  await safeReply(message, text, { skipSuppression: true });
}

export async function tryHandleCaptchaReply(
  message: Message,
  ctx: { redis: Redis; prisma: PrismaClient },
): Promise<boolean> {
  if (message.author.bot) return false;
  if (!isAnticheatEnabled() || !isAnticheatCaptchaEnforceEnabled()) return false;

  const content = message.content.trim();
  if (!content) return false;

  if (!(await hasActiveChallengeSession(ctx.redis, message.author.id))) return false;

  if (await isBotCommandAttempt(message, ctx.redis, content)) return false;
  if (!looksLikeCaptchaAnswer(content)) return false;

  const result = await submitChallengeAnswer(ctx.redis, message.author.id, content, ctx.prisma);
  await replyCaptchaResult(message, result);

  if (result.status === 'wrong') {
    const session = await getActiveChallengeSession(ctx.redis, message.author.id);
    if (session) {
      await trySendCaptchaDm(ctx.redis, message.author, {
        displayName: message.author.displayName || message.author.username,
        session,
      });
    }
  }

  return true;
}
