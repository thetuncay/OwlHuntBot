/**
 * Komut telemetry — OwO export şemasına uyumlu hafif log
 */
import type { PrismaClient } from '@prisma/client';

export function logCommandEvent(
  prisma: PrismaClient,
  params: {
    userId: string;
    guildId: string;
    command: string;
    category?: 'owl_command' | 'user_message';
  },
): void {
  void prisma.commandEvent
    .create({
      data: {
        userId: params.userId,
        guildId: params.guildId,
        command: params.command.slice(0, 64),
        category: params.category ?? 'owl_command',
      },
    })
    .catch((err) => {
      console.error('[Telemetry] CommandEvent yazılamadı:', err instanceof Error ? err.message : err);
    });
}
