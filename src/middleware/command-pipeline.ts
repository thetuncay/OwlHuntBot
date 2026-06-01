import type { Redis } from 'ioredis';
import type { PerfSource } from '../utils/perf-metrics';
import { enforceAntiSpam } from './antiSpam';
import { acquireCommandSlot } from './load-shed';
import { beginCommandPerf } from '../utils/perf-metrics';
import { logCommandError } from '../utils/command-error';

export interface CommandPipelineOptions {
  redis: Redis;
  userId: string;
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

/**
 * Shared command execution wrapper for Discord entrypoints.
 *
 * This intentionally reuses the existing guard stack instead of introducing a
 * new framework: in-flight gate -> anti-spam -> global load-shed -> handler ->
 * guarded Discord error reporting -> perf metrics -> release.
 */
export async function executeCommandPipeline(options: CommandPipelineOptions): Promise<void> {
  const hasGate = options.acquireGate ? options.acquireGate() : true;
  if (!hasGate) return;

  let releaseSlot: (() => Promise<void>) | null = null;
  const perf = beginCommandPerf();
  let perfOk = true;
  let perfError: string | undefined;

  try {
    await enforceAntiSpam(options.redis, options.userId, options.displayName);
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
    await perf
      .finish(options.redis, {
        command: typeof options.command === 'function' ? options.command() : options.command,
        source: options.source,
        ok: perfOk,
        error: perfError,
      })
      .catch(() => null);
    await releaseSlot?.().catch(() => null);
    options.releaseGate?.();
  }
}
