/**
 * flow-intent.ts — Deterministik intent analizi + davranis hafizasi (v2.1 Katman 7).
 */
import type { Redis } from 'ioredis';
import {
  FLOW_AUTOMATION_MAX_AVG_INTERVAL_MS,
  FLOW_AUTOMATION_MAX_STDEV_MS,
  FLOW_AUTOMATION_MIN_SAMPLES,
  FLOW_IMPATIENT_WINDOW_MS,
  FLOW_INTENT_TTL_SECONDS,
  FLOW_LOST_MIN_FAMILIES,
  FLOW_LOST_WINDOW_MS,
} from '../config';
import { recordIntentSignal } from '../ops/flow-analytics';
import { recordAbuseSignal } from '../ops/abuse-analytics';
import { applyAutomationThrottle } from './abuse-breaker';
import { warnRedisDegradation } from '../utils/redis-degradation';
import { observeAutomationSignal } from '../anticheat/trust-score';

export type FlowIntentKind = 'impatient' | 'lost' | 'cooldown_frustration' | 'automation';

export type FlowRejectKind = 'cooldown' | 'inflight' | 'lock' | 'validation' | 'owl_only';

const KEYS = {
  cmdLog: (userId: string) => `flow:cmd:log:${userId}`,
  intentShown: (userId: string, intent: string) => `flow:intent:${intent}:${userId}`,
  intervals: (userId: string, cmd: string) => `flow:interval:${userId}:${cmd}`,
};

const CMD_FAMILIES: Record<string, string> = {
  h: 'hunt', hunt: 'hunt', ah: 'hunt',
  b: 'duel', duel: 'duel', battle: 'duel',
  s: 'stats', stats: 'stats', stat: 'stats',
  cash: 'economy', money: 'economy', bakiye: 'economy',
  yardim: 'help', help: 'help', hlp: 'help',
  market: 'market', mbuy: 'market', msell: 'market', sat: 'market', ms: 'market', pazar: 'market',
  daily: 'daily', wdaily: 'daily',
  quest: 'quest', quests: 'quest', q: 'quest', wq: 'quest', wd: 'quest',
  inv: 'inventory', inventory: 'inventory', envanter: 'inventory',
  katalog: 'catalog', kat: 'catalog', k: 'catalog',
  lb: 'social', top: 'social', liderboard: 'social',
};

function normalizeCmd(command: string): string {
  return command.trim().toLowerCase().split(/\s+/)[0]?.slice(0, 32) ?? 'unknown';
}

function cmdFamily(command: string): string {
  const base = normalizeCmd(command);
  return CMD_FAMILIES[base] ?? base;
}

const IMPATIENT_MSG: Record<string, { second: string; third: string }> = {
  hunt: {
    second: '⏳ Son avın hâlâ işleniyor.',
    third: '💡 Av sonuçlarının gelmesi birkaç saniye sürebilir.',
  },
  duel: {
    second: '⏳ Düello sonuçlanıyor.',
    third: '💡 Düello sonuçları birkaç saniye içinde gelir.',
  },
  default: {
    second: '⏳ Son işlemin hâlâ devam ediyor.',
    third: '💡 Sonuçların gelmesi birkaç saniye sürebilir.',
  },
};

const COOLDOWN_EDUCATION: Record<string, string> = {
  hunt: '💡 Avlar arasında biraz baykuşunun dinlenmesi gerekebilir..',
  duel: '💡 Düellolar arasında kısa hazırlık süresi bulunur.',
  default: '💡 Komutlar arasında kısa bekleme süreleri vardır.',
};

export const LOST_FOOTER_HINT =
  '🦉 Yeniysen **"Owl Hunt"** komudu ile avlan!';

async function intentAlreadyShown(redis: Redis, userId: string, intent: string): Promise<boolean> {
  const v = await redis.get(KEYS.intentShown(userId, intent));
  return v === '1';
}

async function markIntentShown(redis: Redis, userId: string, intent: string): Promise<void> {
  await redis.set(KEYS.intentShown(userId, intent), '1', 'EX', FLOW_INTENT_TTL_SECONDS);
}

export async function recordFlowCommand(
  redis: Redis,
  userId: string,
  command: string,
): Promise<void> {
  try {
    const cmd = normalizeCmd(command);
    const now = Date.now();
    const entry = JSON.stringify({ cmd, ts: now });
    const key = KEYS.cmdLog(userId);
    await redis.lpush(key, entry);
    await redis.ltrim(key, 0, 19);
    await redis.expire(key, FLOW_INTENT_TTL_SECONDS);

    const intervalKey = KEYS.intervals(userId, cmd);
    const lastRaw = await redis.get(intervalKey);
    if (lastRaw) {
      try {
        const lastTs = JSON.parse(lastRaw) as { ts: number };
        const delta = now - lastTs.ts;
        if (delta > 0 && delta < 30_000) {
          await redis.lpush(`${intervalKey}:deltas`, JSON.stringify({ delta }));
          await redis.ltrim(`${intervalKey}:deltas`, 0, 9);
          await redis.expire(`${intervalKey}:deltas`, FLOW_INTENT_TTL_SECONDS);
        }
      } catch {
        // skip
      }
    }
    await redis.set(intervalKey, JSON.stringify({ ts: now }), 'EX', FLOW_INTENT_TTL_SECONDS);
  } catch (err) {
    warnRedisDegradation('recordFlowCommand', err);
  }
}

function stdev(values: number[]): number {
  if (values.length < 2) return 9999;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

async function detectAutomation(redis: Redis, userId: string, command: string): Promise<boolean> {
  const cmd = normalizeCmd(command);
  const raw = await redis.lrange(`${KEYS.intervals(userId, cmd)}:deltas`, 0, FLOW_AUTOMATION_MIN_SAMPLES - 1);
  const deltas: number[] = [];
  for (const line of raw) {
    try {
      const parsed = JSON.parse(line) as { delta?: number };
      if (typeof parsed.delta === 'number') deltas.push(parsed.delta);
    } catch {
      // skip
    }
  }
  if (deltas.length < FLOW_AUTOMATION_MIN_SAMPLES) return false;
  const avg = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const sd = stdev(deltas);
  return sd < FLOW_AUTOMATION_MAX_STDEV_MS && avg < FLOW_AUTOMATION_MAX_AVG_INTERVAL_MS;
}

async function countSameCmdRecent(redis: Redis, userId: string, command: string, windowMs: number): Promise<number> {
  const cmd = normalizeCmd(command);
  const now = Date.now();
  const raw = await redis.lrange(KEYS.cmdLog(userId), 0, 19);
  let count = 0;
  for (const line of raw) {
    try {
      const parsed = JSON.parse(line) as { cmd: string; ts: number };
      if (parsed.cmd === cmd && now - parsed.ts <= windowMs) count++;
    } catch {
      // skip
    }
  }
  return count;
}

async function countDistinctFamiliesRecent(redis: Redis, userId: string, windowMs: number): Promise<number> {
  const now = Date.now();
  const raw = await redis.lrange(KEYS.cmdLog(userId), 0, 19);
  const families = new Set<string>();
  for (const line of raw) {
    try {
      const parsed = JSON.parse(line) as { cmd: string; ts: number };
      if (now - parsed.ts <= windowMs) families.add(cmdFamily(parsed.cmd));
    } catch {
      // skip
    }
  }
  return families.size;
}

export interface FlowIntentResult {
  hint?: string;
  footer?: string;
  intent?: FlowIntentKind;
}

export async function checkAutomationSuspicion(
  redis: Redis,
  userId: string,
  command: string,
): Promise<void> {
  try {
    if (await detectAutomation(redis, userId, command)) {
      recordIntentSignal(redis, 'intent_automation');
      recordAbuseSignal(redis, 'abuse_automation');
      await applyAutomationThrottle(redis, userId);
      observeAutomationSignal(redis, { userId, command });
    }
  } catch (err) {
    warnRedisDegradation('checkAutomationSuspicion', err);
  }
}

export async function analyzeFlowIntent(
  redis: Redis,
  userId: string,
  command: string,
  rejectKind?: FlowRejectKind,
): Promise<FlowIntentResult> {
  try {
    const cmd = normalizeCmd(command);
    const family = cmdFamily(cmd);

    if (await detectAutomation(redis, userId, command)) {
      recordIntentSignal(redis, 'intent_automation');
      recordAbuseSignal(redis, 'abuse_automation');
      await applyAutomationThrottle(redis, userId);
      observeAutomationSignal(redis, { userId, command });
      return { intent: 'automation' };
    }

    if (rejectKind === 'cooldown') {
      const repeats = await countSameCmdRecent(redis, userId, command, FLOW_IMPATIENT_WINDOW_MS);
      if (repeats >= 2) {
        recordIntentSignal(redis, 'intent_cooldown');
        if (!(await intentAlreadyShown(redis, userId, 'cooldown'))) {
          await markIntentShown(redis, userId, 'cooldown');
          const msg = COOLDOWN_EDUCATION[family] ?? COOLDOWN_EDUCATION.default!;
          return { hint: msg, intent: 'cooldown_frustration' };
        }
      }
      return { intent: 'cooldown_frustration' };
    }

    if (rejectKind === 'inflight' || rejectKind === 'lock') {
      const repeats = await countSameCmdRecent(redis, userId, command, FLOW_IMPATIENT_WINDOW_MS);
      recordIntentSignal(redis, 'intent_impatient');
      const msgs = IMPATIENT_MSG[family] ?? IMPATIENT_MSG.default!;
      if (repeats >= 3 && !(await intentAlreadyShown(redis, userId, 'impatient'))) {
        await markIntentShown(redis, userId, 'impatient');
        return { hint: msgs.third, intent: 'impatient' };
      }
      if (repeats >= 2) {
        return { hint: msgs.second, intent: 'impatient' };
      }
      return { intent: 'impatient' };
    }

    const families = await countDistinctFamiliesRecent(redis, userId, FLOW_LOST_WINDOW_MS);
    if (families >= FLOW_LOST_MIN_FAMILIES && !(await intentAlreadyShown(redis, userId, 'lost'))) {
      recordIntentSignal(redis, 'intent_lost');
      await markIntentShown(redis, userId, 'lost');
      return { footer: LOST_FOOTER_HINT, intent: 'lost' };
    }

    return {};
  } catch (err) {
    warnRedisDegradation('analyzeFlowIntent', err);
    return {};
  }
}

export function buildHuntProgressMessage(): string | null {
  return null;
}
