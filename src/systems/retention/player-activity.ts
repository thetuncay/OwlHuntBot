import type { Redis } from 'ioredis';
import { INCR_EXPIRE_SCRIPT, SAFE_DECR_SCRIPT } from '../../utils/redis-scripts';

const PREFIX = 'pa:';
const TTL_LAST_CMD_SEC = 30 * 24 * 60 * 60;
const TTL_SESSION_SEC = 30 * 60;
const TTL_DAILY_SEC = 8 * 24 * 60 * 60;
const TTL_RETURN_BONUS_SEC = 45 * 60;

export interface ActivitySnapshot {
  returnGapDays: number;
  sessionCommandCount: number;
  sessionLossCount: number;
  weeklyTrend: 'active' | 'declining' | 'dormant';
  returnBonusActive: boolean;
}

function key(playerId: string, suffix: string): string {
  return `${PREFIX}${playerId}:${suffix}`;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function calendarGapDays(lastMs: number, nowMs: number): number {
  const lastDay = new Date(lastMs).toISOString().slice(0, 10);
  const nowDay = new Date(nowMs).toISOString().slice(0, 10);
  if (lastDay === nowDay) return 0;
  const lastDate = new Date(`${lastDay}T00:00:00.000Z`);
  const nowDate = new Date(`${nowDay}T00:00:00.000Z`);
  return Math.max(0, Math.round((nowDate.getTime() - lastDate.getTime()) / 86_400_000));
}

function last7DayKeys(referenceMs = Date.now()): string[] {
  const keys: string[] = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(referenceMs - i * 86_400_000);
    keys.push(d.toISOString().slice(0, 10));
  }
  return keys;
}

/**
 * weeklyTrend:
 * - Son 7 günün daily sayıları alınır (hash'ten).
 * - Eğer son 5+ gün 0 ise: 'dormant'
 * - Eğer son 3 günün ortalaması, önceki 4 günün ortalamasının yarısından azsa: 'declining'
 * - Aksi halde: 'active'
 */
function computeWeeklyTrend(dailyCounts: number[]): ActivitySnapshot['weeklyTrend'] {
  if (dailyCounts.length < 7) {
    return 'active';
  }
  const recent5 = dailyCounts.slice(0, 5);
  if (recent5.every((count) => count === 0)) {
    return 'dormant';
  }
  const recent3Avg = (dailyCounts[0]! + dailyCounts[1]! + dailyCounts[2]!) / 3;
  const prior4Avg = (dailyCounts[3]! + dailyCounts[4]! + dailyCounts[5]! + dailyCounts[6]!) / 4;
  if (prior4Avg > 0 && recent3Avg < prior4Avg / 2) {
    return 'declining';
  }
  return 'active';
}

export async function trackCommandActivity(redis: Redis, playerId: string): Promise<void> {
  try {
    const now = Date.now();
    const lastCmdRaw = await redis.get(key(playerId, 'lastCmd'));
    const returnGapDays = lastCmdRaw ? calendarGapDays(Number(lastCmdRaw), now) : 0;

    if (!lastCmdRaw || returnGapDays >= 2) {
      await redis.set(key(playerId, 'retBonusLeft'), '3', 'EX', TTL_RETURN_BONUS_SEC);
    }

    const today = todayUtc();
    await Promise.all([
      redis.set(key(playerId, 'lastCmd'), String(now), 'EX', TTL_LAST_CMD_SEC),
      redis.eval(INCR_EXPIRE_SCRIPT, 1, key(playerId, 'sessCmds'), String(TTL_SESSION_SEC)),
      redis.hincrby(key(playerId, 'daily'), today, 1).then(() =>
        redis.expire(key(playerId, 'daily'), TTL_DAILY_SEC),
      ),
    ]);
  } catch {
    /* fail-open */
  }
}

export async function trackSessionLoss(redis: Redis, playerId: string): Promise<void> {
  try {
    await redis.eval(INCR_EXPIRE_SCRIPT, 1, key(playerId, 'sessLoss'), String(TTL_SESSION_SEC));
  } catch {
    /* fail-open */
  }
}

export async function consumeReturnBonusUse(redis: Redis, playerId: string): Promise<void> {
  try {
    await redis.eval(SAFE_DECR_SCRIPT, 1, key(playerId, 'retBonusLeft'));
  } catch {
    /* fail-open */
  }
}

export async function getPlayerActivitySnapshot(
  redis: Redis,
  playerId: string,
): Promise<ActivitySnapshot> {
  const [lastCmdRaw, sessCmdsRaw, sessLossRaw, retBonusRaw, dailyRaw] = await Promise.all([
    redis.get(key(playerId, 'lastCmd')),
    redis.get(key(playerId, 'sessCmds')),
    redis.get(key(playerId, 'sessLoss')),
    redis.get(key(playerId, 'retBonusLeft')),
    redis.hgetall(key(playerId, 'daily')),
  ]);

  if (!lastCmdRaw && !sessCmdsRaw && !sessLossRaw && !retBonusRaw && Object.keys(dailyRaw).length === 0) {
    return {
      returnGapDays: 0,
      sessionCommandCount: 0,
      sessionLossCount: 0,
      weeklyTrend: 'active',
      returnBonusActive: false,
    };
  }

  const now = Date.now();
  const returnGapDays = lastCmdRaw ? calendarGapDays(Number(lastCmdRaw), now) : 0;
  const dayKeys = last7DayKeys(now);
  const dailyCounts = dayKeys.map((day) => parseInt(dailyRaw[day] ?? '0', 10) || 0);

  return {
    returnGapDays,
    sessionCommandCount: parseInt(sessCmdsRaw ?? '0', 10) || 0,
    sessionLossCount: parseInt(sessLossRaw ?? '0', 10) || 0,
    weeklyTrend: computeWeeklyTrend(dailyCounts),
    returnBonusActive: (parseInt(retBonusRaw ?? '0', 10) || 0) > 0,
  };
}
