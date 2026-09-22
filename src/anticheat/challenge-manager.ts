import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { enqueueDbWrite } from '../utils/db-queue';
import { recordAnticheatEvent } from './audit-logger';
import { generateCaptchaCode, renderCaptchaPng } from './captcha-image';
import {
  CAPTCHA_CODE_LENGTH,
  CAPTCHA_MAX_STRIKES,
  CHALLENGE_PASS_GRACE_SEC,
  CHALLENGE_TIMEOUT_SEC,
  isAnticheatCaptchaEnforceEnabled,
  isAnticheatEnabled,
} from './config';
import { evaluatePunishment } from './punishment-engine';
import { setTrustScoreCache, getTrustScore } from './trust-score';

const CAPTCHA_FAIL_TRUST_DELTA = -20;
const CAPTCHA_IMAGE_NAME = 'captcha.png';

type ChallengeSession = {
  userId: string;
  guildId?: string | null;
  answer: string;
  codeLength: number;
  wrongAttempts: number;
  expiresAt: number;
  /** DM kapalıysa captcha kanalda gösterilir — cevap kanaldan kabul edilir. */
  channelReply?: boolean;
};

type CaptchaPendingMeta = {
  expiresAt: number;
  guildId?: string | null;
  strikeApplied: boolean;
};

export interface ChallengeStartResult {
  started: boolean;
  answer: string;
  codeLength: number;
  imageBuffer: Buffer;
  imageName: string;
  strikes: number;
  expiresAt: number;
}

export interface ChallengeSubmitResult {
  status: 'passed' | 'wrong' | 'expired';
  strikes: number;
  answer?: string;
  codeLength?: number;
}

export interface CaptchaDebugInfo {
  answer: string;
  codeLength: number;
  expiresAt: number;
  strikes: number;
  wrongAttempts: number;
}

function challengeKey(userId: string): string {
  return `ac:challenge:${userId}`;
}

function challengeGraceKey(userId: string): string {
  return `ac:challenge:grace:${userId}`;
}

function captchaPendingKey(userId: string): string {
  return `ac:captcha:pending:${userId}`;
}

function captchaStrikesKey(userId: string): string {
  return `ac:captcha:strikes:${userId}`;
}

async function loadSession(redis: Redis, userId: string): Promise<ChallengeSession | null> {
  const raw = await redis.get(challengeKey(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ChallengeSession;
  } catch {
    return null;
  }
}

async function saveSession(redis: Redis, session: ChallengeSession): Promise<void> {
  const ttlSec = Math.max(30, Math.ceil((session.expiresAt - Date.now()) / 1000));
  await redis.set(challengeKey(session.userId), JSON.stringify(session), 'EX', ttlSec);

  const pending: CaptchaPendingMeta = {
    expiresAt: session.expiresAt,
    guildId: session.guildId,
    strikeApplied: false,
  };
  await redis.set(captchaPendingKey(session.userId), JSON.stringify(pending), 'EX', CHALLENGE_TIMEOUT_SEC + 120);
}

async function clearSession(redis: Redis, userId: string): Promise<void> {
  const session = await loadSession(redis, userId);
  if (session) {
    await redis.del(`ac:captcha:dm_lock:${userId}:${session.answer}`);
  }
  await redis.del(challengeKey(userId));
  await redis.del(captchaPendingKey(userId));
}

/** Test/override: grace + aktif oturumu sıfırla — captcha tekrar tetiklensin. */
export async function resetCaptchaGateState(redis: Redis, userId: string): Promise<void> {
  await clearSession(redis, userId);
  await redis.del(challengeGraceKey(userId));
}

export async function hasChallengePassGrace(redis: Redis, userId: string): Promise<boolean> {
  const v = await redis.get(challengeGraceKey(userId));
  return v === '1';
}

export async function getChallengeGraceTtlSec(redis: Redis, userId: string): Promise<number> {
  const ttl = await redis.ttl(challengeGraceKey(userId));
  return ttl > 0 ? ttl : 0;
}

export async function isCaptchaChannelReplyAllowed(redis: Redis, userId: string): Promise<boolean> {
  const session = await loadSession(redis, userId);
  if (!session || Date.now() >= session.expiresAt) return false;
  return session.channelReply === true;
}

/** Captcha kanalda gösterildi — cevapları kanaldan kabul et. */
export async function markCaptchaChannelDelivery(redis: Redis, userId: string): Promise<void> {
  const session = await loadSession(redis, userId);
  if (!session || Date.now() >= session.expiresAt) return;
  session.channelReply = true;
  await saveSession(redis, session);
}

export async function getCaptchaStrikeCount(redis: Redis, userId: string): Promise<number> {
  const raw = await redis.get(captchaStrikesKey(userId));
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function formatCaptchaStrikeBar(strikes: number, max = CAPTCHA_MAX_STRIKES): string {
  const parts: string[] = [];
  for (let i = 0; i < max; i++) {
    parts.push(i < strikes ? '❌' : '⬛');
  }
  return parts.join(' ');
}

async function incrementCaptchaStrike(
  redis: Redis,
  userId: string,
  guildId?: string | null,
  prisma?: PrismaClient,
): Promise<number> {
  const next = (await getCaptchaStrikeCount(redis, userId)) + 1;
  await redis.set(captchaStrikesKey(userId), String(next));

  recordAnticheatEvent({
    userId,
    guildId,
    eventType: 'captcha_failed',
    severity: next >= CAPTCHA_MAX_STRIKES ? 4 : 3,
    detail: {
      reason: 'captcha_timeout',
      strikes: next,
      maxStrikes: CAPTCHA_MAX_STRIKES,
      observeOnly: !isAnticheatCaptchaEnforceEnabled(),
    },
  });

  enqueueDbWrite({
    type: 'upsertAnticheatTrust',
    userId,
    trustDelta: CAPTCHA_FAIL_TRUST_DELTA,
    violationDelta: 1,
    setLastViolationNow: true,
  });
  const current = await getTrustScore(redis, userId);
  await setTrustScoreCache(redis, userId, current + CAPTCHA_FAIL_TRUST_DELTA);

  if (next >= CAPTCHA_MAX_STRIKES && prisma) {
    await evaluatePunishment(prisma, userId, 'captcha_strike_limit');
  }

  return next;
}

async function applyExpiredCaptchaStrike(
  redis: Redis,
  userId: string,
  prisma?: PrismaClient,
): Promise<void> {
  const pendingRaw = await redis.get(captchaPendingKey(userId));
  if (!pendingRaw) return;

  let pending: CaptchaPendingMeta;
  try {
    pending = JSON.parse(pendingRaw) as CaptchaPendingMeta;
  } catch {
    await redis.del(captchaPendingKey(userId));
    return;
  }

  if (pending.strikeApplied || Date.now() < pending.expiresAt) return;

  pending.strikeApplied = true;
  await redis.set(captchaPendingKey(userId), JSON.stringify(pending), 'EX', 86400);
  await incrementCaptchaStrike(redis, userId, pending.guildId, prisma);
}

function buildStartResult(session: ChallengeSession, strikes: number, imageBuffer: Buffer): ChallengeStartResult {
  return {
    started: true,
    answer: session.answer,
    codeLength: session.codeLength,
    imageBuffer,
    imageName: CAPTCHA_IMAGE_NAME,
    strikes,
    expiresAt: session.expiresAt,
  };
}

export async function hasActiveChallengeSession(redis: Redis, userId: string): Promise<boolean> {
  const session = await loadSession(redis, userId);
  if (!session) return false;
  if (Date.now() >= session.expiresAt) return false;
  return true;
}

export async function getActiveChallengeSession(
  redis: Redis,
  userId: string,
): Promise<ChallengeStartResult | null> {
  const session = await loadSession(redis, userId);
  if (!session || Date.now() >= session.expiresAt) return null;
  const strikes = await getCaptchaStrikeCount(redis, userId);
  const imageBuffer = await renderCaptchaPng(session.answer);
  return buildStartResult(session, strikes, imageBuffer);
}

export async function getCaptchaDebugInfo(
  redis: Redis,
  userId: string,
): Promise<CaptchaDebugInfo | null> {
  const session = await loadSession(redis, userId);
  if (!session || Date.now() >= session.expiresAt) return null;
  const strikes = await getCaptchaStrikeCount(redis, userId);
  return {
    answer: session.answer,
    codeLength: session.codeLength,
    expiresAt: session.expiresAt,
    strikes,
    wrongAttempts: session.wrongAttempts,
  };
}

async function markChallengePassed(redis: Redis, userId: string): Promise<void> {
  await redis.set(challengeGraceKey(userId), '1', 'EX', CHALLENGE_PASS_GRACE_SEC);
}

export async function startChallenge(
  redis: Redis,
  userId: string,
  guildId?: string | null,
  prisma?: PrismaClient,
): Promise<ChallengeStartResult> {
  if (!isAnticheatEnabled()) {
    return {
      started: false,
      answer: '',
      codeLength: 0,
      imageBuffer: Buffer.alloc(0),
      imageName: CAPTCHA_IMAGE_NAME,
      strikes: 0,
      expiresAt: 0,
    };
  }

  const active = await loadSession(redis, userId);
  if (active && Date.now() < active.expiresAt) {
    const strikes = await getCaptchaStrikeCount(redis, userId);
    const imageBuffer = await renderCaptchaPng(active.answer);
    return buildStartResult(active, strikes, imageBuffer);
  }

  if (!active) {
    await applyExpiredCaptchaStrike(redis, userId, prisma);
  } else {
    await clearSession(redis, userId);
    await applyExpiredCaptchaStrike(redis, userId, prisma);
  }

  const expiresAt = Date.now() + CHALLENGE_TIMEOUT_SEC * 1000;
  const answer = generateCaptchaCode(CAPTCHA_CODE_LENGTH);
  const session: ChallengeSession = {
    userId,
    guildId,
    answer,
    codeLength: CAPTCHA_CODE_LENGTH,
    wrongAttempts: 0,
    expiresAt,
  };
  await saveSession(redis, session);

  const strikes = await getCaptchaStrikeCount(redis, userId);
  recordAnticheatEvent({
    userId,
    guildId,
    eventType: 'captcha_issued',
    severity: 1,
    detail: {
      codeLength: CAPTCHA_CODE_LENGTH,
      expiresAt,
      strikes,
      observeOnly: !isAnticheatCaptchaEnforceEnabled(),
    },
  });

  const imageBuffer = await renderCaptchaPng(session.answer);
  return buildStartResult(session, strikes, imageBuffer);
}

export async function submitChallengeAnswer(
  redis: Redis,
  userId: string,
  answer: string,
  prisma?: PrismaClient,
): Promise<ChallengeSubmitResult> {
  const session = await loadSession(redis, userId);
  if (!session || Date.now() >= session.expiresAt) {
    await clearSession(redis, userId);
    await applyExpiredCaptchaStrike(redis, userId, prisma);
    const strikes = await getCaptchaStrikeCount(redis, userId);
    recordAnticheatEvent({
      userId,
      eventType: 'captcha_failed',
      severity: 2,
      detail: { reason: 'challenge_timeout_or_missing', observeOnly: !isAnticheatCaptchaEnforceEnabled() },
    });
    return { status: 'expired', strikes };
  }

  if (answer !== session.answer) {
    session.wrongAttempts += 1;
    session.answer = generateCaptchaCode(CAPTCHA_CODE_LENGTH);
    session.expiresAt = Date.now() + CHALLENGE_TIMEOUT_SEC * 1000;
    await saveSession(redis, session);
    const strikes = await getCaptchaStrikeCount(redis, userId);
    return {
      status: 'wrong',
      strikes,
      answer: session.answer,
      codeLength: session.codeLength,
    };
  }

  await clearSession(redis, userId);
  await markChallengePassed(redis, userId);
  const strikes = await getCaptchaStrikeCount(redis, userId);

  recordAnticheatEvent({
    userId,
    guildId: session.guildId,
    eventType: 'captcha_passed',
    severity: 1,
    detail: { codeLength: session.codeLength, strikes },
  });

  return { status: 'passed', strikes };
}
