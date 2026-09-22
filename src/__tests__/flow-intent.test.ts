import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createFlowIntentRedisMock } from './helpers/flow-intent-redis-mock';

vi.mock('../config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../config')>();
  return {
    ...actual,
    FLOW_IMPATIENT_WINDOW_MS: 5000,
    FLOW_LOST_WINDOW_MS: 60_000,
    FLOW_LOST_MIN_FAMILIES: 4,
    FLOW_INTENT_TTL_SECONDS: 1800,
    FLOW_AUTOMATION_MIN_SAMPLES: 5,
    FLOW_AUTOMATION_MAX_STDEV_MS: 100,
    FLOW_AUTOMATION_MAX_AVG_INTERVAL_MS: 400,
  };
});

vi.mock('../ops/flow-analytics', () => ({
  recordIntentSignal: vi.fn(),
  recordFlowReject: vi.fn(),
}));

vi.mock('../ops/abuse-analytics', () => ({
  recordAbuseSignal: vi.fn(),
}));

vi.mock('../middleware/abuse-breaker', () => ({
  applyAutomationThrottle: vi.fn(async () => undefined),
}));

vi.mock('../anticheat/trust-score', () => ({
  observeAutomationSignal: vi.fn(),
}));

import { analyzeFlowIntent, buildHuntProgressMessage, recordFlowCommand } from '../middleware/flow-intent';
import { applyAutomationThrottle } from '../middleware/abuse-breaker';
import { observeAutomationSignal } from '../anticheat/trust-score';

describe('flow-intent', () => {
  const userId = 'user-intent-test';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('buildHuntProgressMessage is disabled until copy is set', () => {
    expect(buildHuntProgressMessage()).toBeNull();
  });

  it('impatient on inflight reject — 2nd repeat shows progress hint', async () => {
    const redis = createFlowIntentRedisMock();
    const now = Date.now();
    redis._lists.set(`flow:cmd:log:${userId}`, [
      JSON.stringify({ cmd: 'hunt', ts: now - 500 }),
      JSON.stringify({ cmd: 'hunt', ts: now - 100 }),
    ]);

    const result = await analyzeFlowIntent(redis as any, userId, 'hunt', 'inflight');
    expect(result.intent).toBe('impatient');
    expect(result.hint).toContain('işleniyor');
  });

  it('impatient education once on 3rd inflight repeat', async () => {
    const redis = createFlowIntentRedisMock();
    const now = Date.now();
    redis._lists.set(`flow:cmd:log:${userId}`, [
      JSON.stringify({ cmd: 'hunt', ts: now - 2000 }),
      JSON.stringify({ cmd: 'hunt', ts: now - 1000 }),
      JSON.stringify({ cmd: 'hunt', ts: now - 200 }),
    ]);

    const first = await analyzeFlowIntent(redis as any, userId, 'hunt', 'inflight');
    expect(first.hint).toContain('birkaç saniye');

    redis._store.set(`flow:intent:impatient:${userId}`, '1');
    const second = await analyzeFlowIntent(redis as any, userId, 'hunt', 'inflight');
    expect(second.hint).toContain('işleniyor');
    expect(second.hint).not.toContain('birkaç saniye');
  });

  it('lock reject uses impatient path', async () => {
    const redis = createFlowIntentRedisMock();
    const now = Date.now();
    redis._lists.set(`flow:cmd:log:${userId}`, [
      JSON.stringify({ cmd: 'sell', ts: now - 300 }),
      JSON.stringify({ cmd: 'sell', ts: now - 50 }),
    ]);

    const result = await analyzeFlowIntent(redis as any, userId, 'sell', 'lock');
    expect(result.intent).toBe('impatient');
    expect(result.hint).toBeDefined();
  });

  it('lost intent after 4 read-only families', async () => {
    const redis = createFlowIntentRedisMock();
    const now = Date.now();
    const cmds = ['stats', 'cash', 'yardim', 'market'];
    redis._lists.set(
      `flow:cmd:log:${userId}`,
      cmds.map((cmd, i) => JSON.stringify({ cmd, ts: now - (cmds.length - i) * 1000 })),
    );

    const result = await analyzeFlowIntent(redis as any, userId, 'help');
    expect(result.intent).toBe('lost');
    expect(result.footer).toContain('avlan');
  });

  it('cooldown frustration education once', async () => {
    const redis = createFlowIntentRedisMock();
    const now = Date.now();
    redis._lists.set(`flow:cmd:log:${userId}`, [
      JSON.stringify({ cmd: 'duel', ts: now - 800 }),
      JSON.stringify({ cmd: 'duel', ts: now - 100 }),
    ]);

    const first = await analyzeFlowIntent(redis as any, userId, 'duel', 'cooldown');
    expect(first.intent).toBe('cooldown_frustration');
    expect(first.hint).toContain('Düello');

    const second = await analyzeFlowIntent(redis as any, userId, 'duel', 'cooldown');
    expect(second.hint).toBeUndefined();
  });

  it('automation suspicion on regular ~250ms pattern', async () => {
    const redis = createFlowIntentRedisMock();
    const deltas = [248, 252, 250, 249, 251].map((delta) => JSON.stringify({ delta }));
    redis._lists.set(`flow:interval:${userId}:hunt:deltas`, deltas);

    const result = await analyzeFlowIntent(redis as any, userId, 'hunt');
    expect(result.intent).toBe('automation');
    expect(applyAutomationThrottle).toHaveBeenCalled();
    expect(observeAutomationSignal).toHaveBeenCalled();
  });

  it('fail-open when redis throws', async () => {
    const redis = createFlowIntentRedisMock();
    redis.lrange = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const result = await analyzeFlowIntent(redis as any, userId, 'hunt', 'inflight');
    expect(result).toEqual({});
  });

  it('recordFlowCommand fail-open', async () => {
    const redis = createFlowIntentRedisMock();
    redis.lpush = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    await expect(recordFlowCommand(redis as any, userId, 'hunt')).resolves.toBeUndefined();
  });

  it('recordFlowCommand reads interval timestamp via GET (string key)', async () => {
    const redis = createFlowIntentRedisMock();
    await recordFlowCommand(redis as any, userId, 'cf');
    await new Promise((r) => setTimeout(r, 5));
    await recordFlowCommand(redis as any, userId, 'cf');
    expect(redis.lindex).not.toHaveBeenCalled();
    const deltas = await redis.lrange(`flow:interval:${userId}:cf:deltas`, 0, 9);
    expect(deltas.length).toBeGreaterThan(0);
  });
});
