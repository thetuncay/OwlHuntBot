export type RateLimitLevel = 'ok' | 'soft' | 'hard_violation';

export interface RateLimitResult {
  allowed: boolean;
  level: RateLimitLevel;
  retryAfterMs?: number;
  command: string;
}

export interface AnticheatGateContext {
  userId: string;
  guildId?: string | null;
  command: string;
  displayName?: string;
  prisma?: import('@prisma/client').PrismaClient;
}

export type AnticheatEventType =
  | 'rate_limit_soft'
  | 'rate_limit_hard'
  | 'behavior_anomaly'
  | 'captcha_issued'
  | 'captcha_passed'
  | 'captcha_failed'
  | 'reward_throttled'
  | 'multi_account_flag'
  | 'manual_review';

export interface AnticheatEventPayload {
  userId: string;
  guildId?: string | null;
  eventType: AnticheatEventType;
  severity: number;
  detail: Record<string, unknown>;
}
