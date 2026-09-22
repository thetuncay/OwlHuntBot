import { beforeEach, describe, expect, it, vi } from 'vitest';

const { enqueueDbWriteMock, recordAnticheatEventMock } = vi.hoisted(() => ({
  enqueueDbWriteMock: vi.fn(),
  recordAnticheatEventMock: vi.fn(),
}));

vi.mock('../utils/db-queue', () => ({
  enqueueDbWrite: enqueueDbWriteMock,
}));

vi.mock('../anticheat/audit-logger', () => ({
  recordAnticheatEvent: recordAnticheatEventMock,
}));

import { observeAutomationSignal } from '../anticheat/trust-score';

describe('anticheat trust-score', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTICHEAT_ENABLED = '1';
    process.env.ANTICHEAT_BEHAVIOR_LOG = '1';
    process.env.ANTICHEAT_TRUST_SCORE = '1';
  });

  it('records event and trust penalty for automation signal', () => {
    const redis = {
      set: vi.fn(async () => 'OK'),
    };

    observeAutomationSignal(redis as any, {
      userId: 'u1',
      guildId: 'g1',
      command: 'hunt',
    });

    expect(recordAnticheatEventMock).toHaveBeenCalledTimes(1);
    expect(enqueueDbWriteMock).toHaveBeenCalledWith({
      type: 'upsertAnticheatTrust',
      userId: 'u1',
      trustDelta: -5,
      violationDelta: 1,
      setLastViolationNow: true,
    });
  });
});
