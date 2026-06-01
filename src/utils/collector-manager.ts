export interface ManagedCollector {
  on(event: 'end', listener: (...args: unknown[]) => void): this;
  stop(reason?: string): void;
}

export interface CollectorRegistration {
  messageId: string;
  purpose: string;
  ownerId?: string;
  expiresAtMs: number;
}

export interface CollectorRegistrationResult {
  registered: boolean;
  key: string;
  duplicate: boolean;
}

export interface CollectorMetricsSnapshot {
  activeCollectors: number;
  duplicateCollectors: number;
  expiredCollectors: number;
  collectorLeaks: number;
}

interface CollectorEntry {
  collector: ManagedCollector;
  meta: CollectorRegistration;
}

const collectors = new Map<string, CollectorEntry>();
let duplicateCollectors = 0;
let expiredCollectors = 0;
let collectorLeaks = 0;

function collectorKey(messageId: string, purpose: string): string {
  return `collector:${messageId}:${purpose}`;
}

/**
 * Passive registry for Discord message component collectors.
 *
 * Existing commands can opt into this without changing their message-bound
 * behavior. The manager prevents same-message/same-purpose duplicate collector
 * registration and exposes lifecycle counters for perf/admin reporting.
 */
export function registerCollector(
  collector: ManagedCollector,
  meta: CollectorRegistration,
): CollectorRegistrationResult {
  const key = collectorKey(meta.messageId, meta.purpose);
  const existing = collectors.get(key);
  const now = Date.now();

  if (existing && existing.meta.expiresAtMs > now) {
    duplicateCollectors++;
    return { registered: false, key, duplicate: true };
  }

  collectors.set(key, { collector, meta });
  collector.on('end', () => {
    collectors.delete(key);
  });

  return { registered: true, key, duplicate: false };
}

export function unregisterCollector(messageId: string, purpose: string): void {
  collectors.delete(collectorKey(messageId, purpose));
}

export function sweepExpiredCollectors(now = Date.now()): number {
  let removed = 0;
  for (const [key, entry] of collectors.entries()) {
    if (entry.meta.expiresAtMs > now) continue;
    collectors.delete(key);
    expiredCollectors++;
    collectorLeaks++;
    removed++;
  }
  return removed;
}

export function stopAllCollectors(reason = 'shutdown'): number {
  const active = [...collectors.values()];
  collectors.clear();
  for (const entry of active) {
    entry.collector.stop(reason);
  }
  return active.length;
}

export function collectorMetricsSnapshot(): CollectorMetricsSnapshot {
  return {
    activeCollectors: collectors.size,
    duplicateCollectors,
    expiredCollectors,
    collectorLeaks,
  };
}
