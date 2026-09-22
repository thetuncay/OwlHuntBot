/**
 * flow-analytics.ts — Flow reject + intent counters (observe-only).
 */
import type { Redis } from 'ioredis';
import { opsAbuseTtlSec } from './ops-config';

export type FlowRejectReason =
  | 'flow_cooldown'
  | 'flow_validation'
  | 'flow_lock'
  | 'flow_inflight'
  | 'flow_owl_only';

export type IntentSignal =
  | 'intent_impatient'
  | 'intent_lost'
  | 'intent_cooldown'
  | 'intent_automation';

function dateKey(date = new Date()): string {
  const y = date.getUTCFullYear();
  const mo = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}${mo}${d}`;
}

function flowKey(signal: FlowRejectReason | IntentSignal, date = new Date()): string {
  return `ops:flow:${signal}:${dateKey(date)}`;
}

export function recordFlowReject(redis: Redis, reason: FlowRejectReason): void {
  const key = flowKey(reason);
  void redis.multi().incr(key).expire(key, opsAbuseTtlSec()).exec().catch(() => null);
}

export function recordIntentSignal(redis: Redis, signal: IntentSignal): void {
  const key = flowKey(signal);
  void redis.multi().incr(key).expire(key, opsAbuseTtlSec()).exec().catch(() => null);
}

export interface FlowCounts24h {
  flowCooldown: number;
  flowValidation: number;
  flowLock: number;
  flowInflight: number;
  flowOwlOnly: number;
  intentImpatient: number;
  intentLost: number;
  intentCooldown: number;
  intentAutomation: number;
}

async function sumSignal24h(
  redis: Redis,
  signal: FlowRejectReason | IntentSignal,
): Promise<number> {
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  const [t, y] = await Promise.all([
    redis.get(flowKey(signal, today)).catch(() => null),
    redis.get(flowKey(signal, yesterday)).catch(() => null),
  ]);
  return (parseInt(t ?? '0', 10) || 0) + (parseInt(y ?? '0', 10) || 0);
}

export async function getFlowCounts24h(redis: Redis): Promise<FlowCounts24h> {
  const [
    flowCooldown,
    flowValidation,
    flowLock,
    flowInflight,
    flowOwlOnly,
    intentImpatient,
    intentLost,
    intentCooldown,
    intentAutomation,
  ] = await Promise.all([
    sumSignal24h(redis, 'flow_cooldown'),
    sumSignal24h(redis, 'flow_validation'),
    sumSignal24h(redis, 'flow_lock'),
    sumSignal24h(redis, 'flow_inflight'),
    sumSignal24h(redis, 'flow_owl_only'),
    sumSignal24h(redis, 'intent_impatient'),
    sumSignal24h(redis, 'intent_lost'),
    sumSignal24h(redis, 'intent_cooldown'),
    sumSignal24h(redis, 'intent_automation'),
  ]);
  return {
    flowCooldown,
    flowValidation,
    flowLock,
    flowInflight,
    flowOwlOnly,
    intentImpatient,
    intentLost,
    intentCooldown,
    intentAutomation,
  };
}
