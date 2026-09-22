import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import type { PerfSource } from '../utils/perf-metrics';
import { recordCommandAnalytics } from '../ops/command-analytics';
import { assertAbuseThrottleGate, recordAbuseAccountingOnSuccess } from './abuse-breaker';
import { acquireCommandSlot } from './load-shed';
import { beginCommandPerf } from '../utils/perf-metrics';
import { logCommandError } from '../utils/command-error';
import { assertCommandAccess } from '../utils/admin-access';
import { assertOwlOnlyChannel } from '../utils/owl-only-channels';
import { SuppressionKeys, UserFacingError } from '../utils/response-suppression';
import { recordFlowReject } from '../ops/flow-analytics';
import { recordFlowCommand, checkAutomationSuspicion } from './flow-intent';
import { resolveFlowRejectMessage } from '../utils/flow-helpers';
import { buildInflightBusyMessage } from '../utils/command-error';
import { recordUserCommandChannel } from '../utils/user-command-channel';
import { checkAnticheatGate, recordAnticheatSuccess } from '../anticheat';
import { runDetached } from '../utils/async';
import { trackCommandActivity } from '../systems/retention/player-activity';

export interface CommandPipelineOptions {
  redis: Redis;
  prisma?: PrismaClient;
  userId: string;
  guildId?: string | null;
  channelId?: string | null;
  parentChannelId?: string | null;
  owlOnlyExempt?: boolean;
  displayName?: string;
  command: string | (() => string);
  source: PerfSource;
  logLabel: string;
  acquireGate?: () => boolean;
  releaseGate?: () => void;
  execute: () => Promise<void>;
  notifyError: (error: unknown) => Promise<boolean>;
}

function isUnknownInteraction(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 10062
  );
}

function resolveCommandName(options: CommandPipelineOptions): string {
  return typeof options.command === 'function' ? options.command() : options.command;
}

/**
 * v2.1 pipeline: access → owl-only → flow log → automation → throttle gate → handler → abuse accounting.
 * Flow reject (cooldown/validation/lock/inflight) abuse sayacina girmez.
 */
export async function executeCommandPipeline(options: CommandPipelineOptions): Promise<void> {
  const commandName = resolveCommandName(options);

  const hasGate = options.acquireGate ? options.acquireGate() : true;
  if (!hasGate) {
    const name = options.displayName?.trim() || 'Sen';
    recordFlowReject(options.redis, 'flow_inflight');
    const base = buildInflightBusyMessage(name);
    const msg = await resolveFlowRejectMessage(
      options.redis,
      options.userId,
      commandName,
      'inflight',
      base,
    );
    await options.notifyError(
      new UserFacingError(msg, SuppressionKeys.state('command-inflight')),
    );
    return;
  }

  let releaseSlot: (() => Promise<void>) | null = null;
  const perf = beginCommandPerf();
  let perfOk = true;
  let perfError: string | undefined;

  try {
    await assertCommandAccess(options.redis, options.userId);
    try {
      await assertOwlOnlyChannel(options.redis, {
        guildId: options.guildId,
        channelId: options.channelId,
        parentChannelId: options.parentChannelId,
        userId: options.userId,
        exempt: options.owlOnlyExempt ?? false,
      });
    } catch (owlErr) {
      recordFlowReject(options.redis, 'flow_owl_only');
      throw owlErr;
    }

    await recordFlowCommand(options.redis, options.userId, commandName);
    runDetached('pa-track', () => trackCommandActivity(options.redis, options.userId));
    void checkAutomationSuspicion(options.redis, options.userId, commandName).catch(() => null);

    await checkAnticheatGate(options.redis, {
      userId: options.userId,
      guildId: options.guildId,
      command: commandName,
      displayName: options.displayName,
      prisma: options.prisma,
    });

    await assertAbuseThrottleGate(options.redis, {
      userId: options.userId,
      command: commandName,
      displayName: options.displayName,
    });

    releaseSlot = await acquireCommandSlot(options.redis);
    perf.markQueueDone();
    await options.execute();
  } catch (error) {
    if (isUnknownInteraction(error)) return;
    perfOk = false;
    perfError = error instanceof Error ? error.message : String(error);
    if (await options.notifyError(error)) return;
    logCommandError(options.logLabel, error);
  } finally {
    if (perfOk) {
      const finalCommand = resolveCommandName(options);
      recordAnticheatSuccess({
        userId: options.userId,
        guildId: options.guildId,
        command: finalCommand,
        displayName: options.displayName,
      });
      await recordAbuseAccountingOnSuccess(options.redis, {
        userId: options.userId,
        command: finalCommand,
        displayName: options.displayName,
      }).catch(() => null);
      await recordUserCommandChannel(options.redis, {
        userId: options.userId,
        guildId: options.guildId,
        channelId: options.channelId,
        parentChannelId: options.parentChannelId,
      });
    }

    await perf
      .finish(options.redis, {
        command: resolveCommandName(options),
        source: options.source,
        ok: perfOk,
        error: perfError,
      })
      .catch(() => null);
    await recordCommandAnalytics(options.redis, {
      command: resolveCommandName(options),
      source: options.source,
      userId: options.userId,
      guildId: options.guildId,
      ok: perfOk,
      durationMs: perf.elapsedMs(),
    }).catch(() => null);
    await releaseSlot?.().catch(() => null);
    options.releaseGate?.();
  }
}
