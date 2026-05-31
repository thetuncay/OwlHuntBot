/**
 * Komut telemetry — prefix komutlarini batch insert ile yazar.
 * Hot-path'te tek tek INSERT yerine in-memory kuyruk + createMany kullanilir.
 */
import type { Prisma, PrismaClient } from '@prisma/client';

const TELEMETRY_MAX_PENDING = 20_000;
const telemetryQueue: Prisma.CommandEventCreateManyInput[] = [];

let droppedTelemetry = 0;

export function logCommandEvent(
  _prisma: PrismaClient,
  params: {
    userId: string;
    guildId: string;
    command: string;
    category?: 'owl_command' | 'user_message';
  },
): void {
  if (telemetryQueue.length >= TELEMETRY_MAX_PENDING) {
    // Kuyruk tasarsa memory blow-up olmasin; en eskiyi at.
    telemetryQueue.shift();
    droppedTelemetry++;
  }
  telemetryQueue.push({
    userId: params.userId,
    guildId: params.guildId,
    command: params.command.slice(0, 64),
    category: params.category ?? 'owl_command',
  });
}

export async function flushCommandEvents(
  prisma: PrismaClient,
  batchSize = 1000,
): Promise<void> {
  if (telemetryQueue.length === 0) return;
  const size = Math.max(100, batchSize);
  while (telemetryQueue.length > 0) {
    const batch = telemetryQueue.splice(0, size);
    if (batch.length === 0) break;
    try {
      await prisma.commandEvent.createMany({
        data: batch,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[Telemetry] CommandEvent batch yazılamadı:', msg);
      // Yazılamayan batch'i kaybetme: tekrar başa ekle, loop'u kır.
      telemetryQueue.unshift(...batch);
      break;
    }
  }
}

export function telemetryQueueSize(): number {
  return telemetryQueue.length;
}

export function consumeDroppedTelemetryCount(): number {
  const dropped = droppedTelemetry;
  droppedTelemetry = 0;
  return dropped;
}
