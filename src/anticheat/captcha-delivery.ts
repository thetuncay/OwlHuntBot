import { AttachmentBuilder, type MessageCreateOptions, type User } from 'discord.js';
import type { Redis } from 'ioredis';
import type { ChallengeStartResult } from './challenge-manager';
import {
  buildChallengeGateMessage,
  buildChallengePromptMessage,
} from './ui/challenge-components';
import { CHALLENGE_TIMEOUT_SEC } from './config';

function captchaDmLockKey(userId: string, answer: string): string {
  return `ac:captcha:dm_lock:${userId}:${answer}`;
}

export function buildCaptchaDmPayload(
  displayName: string,
  session: ChallengeStartResult,
): MessageCreateOptions {
  return {
    content:
      `${buildChallengeGateMessage(displayName)}\n\n` +
      buildChallengePromptMessage(session.codeLength),
    files: [new AttachmentBuilder(session.imageBuffer, { name: session.imageName })],
  };
}

/** Atomik kilit — aynı captcha için DM yalnızca bir kez (shard/race güvenli). */
export async function trySendCaptchaDm(
  redis: Redis,
  user: User,
  opts: { displayName: string; session: ChallengeStartResult },
): Promise<'sent' | 'already_sent' | 'failed'> {
  const lockKey = captchaDmLockKey(user.id, opts.session.answer);
  const claimed = await redis.set(lockKey, '1', 'EX', CHALLENGE_TIMEOUT_SEC, 'NX');
  if (claimed !== 'OK') return 'already_sent';

  try {
    const dm = await user.createDM();
    await dm.send(buildCaptchaDmPayload(opts.displayName, opts.session));
    return 'sent';
  } catch {
    await redis.del(lockKey);
    return 'failed';
  }
}
