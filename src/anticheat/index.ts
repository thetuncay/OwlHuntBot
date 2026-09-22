import type { Redis } from 'ioredis';
import { SuppressionKeys, UserFacingError } from '../utils/response-suppression';
import { buildCooldownMessage } from '../utils/command-error';
import { isAnticheatEnabled, isAnticheatRateLimitEnforceEnabled } from './config';
import { recordAnticheatEvent } from './audit-logger';
import { checkRateLimit } from './rate-limiter';
import { checkChallengeGate } from './challenge-gate';
import type { AnticheatGateContext } from './types';

export async function checkAnticheatGate(
  redis: Redis,
  ctx: AnticheatGateContext,
): Promise<void> {
  if (!isAnticheatEnabled()) return;

  await checkChallengeGate(redis, ctx);

  const result = await checkRateLimit(redis, ctx.userId, ctx.command);
  if (result.level === 'hard_violation') {
    recordAnticheatEvent({
      userId: ctx.userId,
      guildId: ctx.guildId,
      eventType: 'rate_limit_hard',
      severity: 2,
      detail: { command: result.command },
    });
  }

  if (result.allowed || !isAnticheatRateLimitEnforceEnabled()) return;

  const displayName = ctx.displayName?.trim() || 'Sen';
  recordAnticheatEvent({
    userId: ctx.userId,
    guildId: ctx.guildId,
    eventType: 'rate_limit_soft',
    severity: 1,
    detail: { command: result.command, retryAfterMs: result.retryAfterMs ?? 0 },
  });

  throw new UserFacingError(
    buildCooldownMessage(result.retryAfterMs ?? 1000, 'generic', displayName),
    SuppressionKeys.cooldown(`anticheat:${result.command}`),
  );
}

export function recordAnticheatSuccess(_ctx: AnticheatGateContext): void {
  if (!isAnticheatEnabled()) return;
}
