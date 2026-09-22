import { describe, expect, it, vi } from 'vitest';
import {
  collectorMetricsSnapshot,
  registerCollector,
  stopAllCollectors,
  sweepExpiredCollectors,
  type ManagedCollector,
} from '../utils/collector-manager';

function createCollector(): ManagedCollector & {
  end: () => void;
  stopSpy: ReturnType<typeof vi.fn>;
} {
  const endListeners: Array<(...args: unknown[]) => void> = [];
  const stopSpy = vi.fn();
  return {
    on(event: 'end', listener: (...args: unknown[]) => void) {
      if (event === 'end') endListeners.push(listener);
      return this;
    },
    stop: stopSpy,
    end() {
      for (const listener of endListeners) listener();
    },
    stopSpy,
  };
}

describe('collector-manager', () => {
  it('rejects duplicate collectors for the same message and purpose', () => {
    stopAllCollectors('test-reset');
    const first = createCollector();
    const second = createCollector();
    const expiresAtMs = Date.now() + 30_000;

    expect(
      registerCollector(first, { messageId: 'm1', purpose: 'stats', expiresAtMs }).registered,
    ).toBe(true);
    const duplicate = registerCollector(second, { messageId: 'm1', purpose: 'stats', expiresAtMs });

    expect(duplicate.registered).toBe(false);
    expect(duplicate.duplicate).toBe(true);
    expect(collectorMetricsSnapshot().activeCollectors).toBe(1);
    stopAllCollectors('test-reset');
  });

  it('unregisters collectors on end', () => {
    stopAllCollectors('test-reset');
    const collector = createCollector();

    registerCollector(collector, {
      messageId: 'm2',
      purpose: 'inventory',
      expiresAtMs: Date.now() + 30_000,
    });
    collector.end();

    expect(collectorMetricsSnapshot().activeCollectors).toBe(0);
  });

  it('sweeps expired collectors as leaks', () => {
    stopAllCollectors('test-reset');
    const before = collectorMetricsSnapshot();
    registerCollector(createCollector(), {
      messageId: 'm3',
      purpose: 'expired',
      expiresAtMs: Date.now() - 1,
    });

    expect(sweepExpiredCollectors()).toBe(1);
    const after = collectorMetricsSnapshot();
    expect(after.expiredCollectors).toBe(before.expiredCollectors + 1);
    expect(after.collectorLeaks).toBe(before.collectorLeaks + 1);
  });
});
