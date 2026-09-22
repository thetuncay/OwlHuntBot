import { describe, expect, it, vi } from 'vitest';

const { enqueueDbWriteMock } = vi.hoisted(() => ({
  enqueueDbWriteMock: vi.fn(),
}));

vi.mock('../utils/db-queue', () => ({
  enqueueDbWrite: enqueueDbWriteMock,
}));

import { recordAnticheatEvent } from '../anticheat/audit-logger';

describe('anticheat audit logger', () => {
  it('enqueues anticheat event payload to db queue', () => {
    recordAnticheatEvent({
      userId: 'u1',
      guildId: 'g1',
      eventType: 'rate_limit_hard',
      severity: 2,
      detail: { command: 'hunt' },
    });

    expect(enqueueDbWriteMock).toHaveBeenCalledTimes(1);
    expect(enqueueDbWriteMock).toHaveBeenCalledWith({
      type: 'recordAnticheatEvent',
      userId: 'u1',
      guildId: 'g1',
      eventType: 'rate_limit_hard',
      severity: 2,
      detail: { command: 'hunt' },
    });
  });
});
