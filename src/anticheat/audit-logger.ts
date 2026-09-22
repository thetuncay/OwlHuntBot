import { enqueueDbWrite } from '../utils/db-queue';
import type { AnticheatEventPayload } from './types';

export function recordAnticheatEvent(payload: AnticheatEventPayload): void {
  enqueueDbWrite({
    type: 'recordAnticheatEvent',
    userId: payload.userId,
    guildId: payload.guildId ?? null,
    eventType: payload.eventType,
    severity: payload.severity,
    detail: payload.detail,
  });
}
