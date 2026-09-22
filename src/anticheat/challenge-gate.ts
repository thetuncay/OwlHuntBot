import type { Redis } from 'ioredis';
import { SuppressionKeys } from '../utils/response-suppression';
import {
  CHALLENGE_TRUST_THRESHOLD,
  isAnticheatCaptchaEnforceEnabled,
  isAnticheatEnabled,
  isAnticheatTrustScoreEnabled,
} from './config';
import { ChallengeRequiredError } from './challenge-errors';
import {
  getActiveChallengeSession,
  hasChallengePassGrace,
  startChallenge,
} from './challenge-manager';
import {
  buildChallengeCaptchaPayload,
  buildChallengeGateMessage,
} from './ui/challenge-components';
import { resolveTrustScore } from './trust-score';
import type { AnticheatGateContext } from './types';

export async function checkChallengeGate(redis: Redis, ctx: AnticheatGateContext): Promise<void> {
  if (!isAnticheatEnabled() || !isAnticheatCaptchaEnforceEnabled()) return;
  if (!isAnticheatTrustScoreEnabled()) return;

  const active = await getActiveChallengeSession(redis, ctx.userId);
  const trust = await resolveTrustScore(redis, ctx.userId, ctx.prisma);
  if (trust > CHALLENGE_TRUST_THRESHOLD && !active) return;

  if (await hasChallengePassGrace(redis, ctx.userId)) return;

  const session = active ?? (await startChallenge(redis, ctx.userId, ctx.guildId, ctx.prisma));

  if (!session.started || session.codeLength === 0) return;

  const displayName = ctx.displayName?.trim() || 'Sen';
  const payload = buildChallengeCaptchaPayload(session);
  throw new ChallengeRequiredError(
    buildChallengeGateMessage(displayName),
    payload,
    displayName,
  );
}

export function challengeSuppressionKey(): string {
  return SuppressionKeys.state('anticheat-challenge');
}
