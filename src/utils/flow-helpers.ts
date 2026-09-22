/**
 * flow-helpers.ts — Intent ipuclarini kullanici mesajlarina ekleme.
 */
import type { Redis } from 'ioredis';
import { EmbedBuilder } from 'discord.js';
import { recordFlowReject } from '../ops/flow-analytics';
import {
  analyzeFlowIntent,
  type FlowRejectKind,
  type FlowIntentResult,
} from '../middleware/flow-intent';
import { LockContentionError } from '../utils/lock';

export function appendFlowIntent(baseMessage: string, intent: FlowIntentResult): string {
  if (intent.hint) {
    return `${baseMessage}\n${intent.hint}`;
  }
  if (intent.footer) {
    return `${baseMessage}\n\n${intent.footer}`;
  }
  return baseMessage;
}

/** @deprecated use appendFlowIntent */
export function appendFlowHint(baseMessage: string, intent: FlowIntentResult): string {
  return appendFlowIntent(baseMessage, intent);
}

export async function getLostFooterIfNeeded(
  redis: Redis,
  userId: string,
  command: string,
): Promise<string | undefined> {
  const intent = await analyzeFlowIntent(redis, userId, command);
  return intent.footer;
}

export async function appendLostFooterIfNeeded(
  redis: Redis,
  userId: string,
  command: string,
  content: string,
): Promise<string> {
  const intent = await analyzeFlowIntent(redis, userId, command);
  return appendFlowIntent(content, intent);
}

/** Embed footer'a Lost ipucu ekler (varsa). */
export async function embedWithLostFooterIfNeeded(
  redis: Redis,
  userId: string,
  command: string,
  embed: EmbedBuilder,
): Promise<EmbedBuilder> {
  const lostFooter = await getLostFooterIfNeeded(redis, userId, command);
  if (!lostFooter) return embed;
  const current = embed.data.footer?.text ?? '';
  return EmbedBuilder.from(embed).setFooter({
    text: current ? `${current} · ${lostFooter}` : lostFooter,
  });
}

export async function resolveFlowRejectMessage(
  redis: Redis,
  userId: string,
  command: string,
  rejectKind: FlowRejectKind,
  baseMessage: string,
): Promise<string> {
  recordFlowReject(redis, flowRejectToMetric(rejectKind));
  const intent = await analyzeFlowIntent(redis, userId, command, rejectKind);
  return appendFlowHint(baseMessage, intent);
}

function flowRejectToMetric(kind: FlowRejectKind): Parameters<typeof recordFlowReject>[1] {
  switch (kind) {
    case 'cooldown': return 'flow_cooldown';
    case 'validation': return 'flow_validation';
    case 'lock': return 'flow_lock';
    case 'inflight': return 'flow_inflight';
    case 'owl_only': return 'flow_owl_only';
    default: return 'flow_validation';
  }
}

export function isLockContentionError(error: unknown): error is LockContentionError {
  return error instanceof LockContentionError;
}

export async function resolveLockErrorMessage(
  redis: Redis,
  userId: string,
  command: string,
  error: LockContentionError,
): Promise<string> {
  return resolveFlowRejectMessage(redis, userId, command, 'lock', error.message);
}
