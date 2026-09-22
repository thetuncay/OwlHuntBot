/**
 * Telafi hatırlatma — worker tarama + shard DM/kanal kuyruğu (1. ve 6. gün).
 */
import type { Client } from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { daysUntilExpiry } from './rebalance-compensation';
import { resolveFeedbackAnnounceTarget } from '../utils/user-command-channel';

const QUEUE_KEY = 'queue:compensation_reminder';
const SENT_PREFIX = 'compensation:reminder:sent:';

export interface CompensationReminderJob {
  userId: string;
  day: 1 | 6;
  daysLeft: number;
  at: string;
}

export function buildCompensationReminderMessage(job: CompensationReminderJob, prefix = 'w'): string {
  const dayLabel = job.day === 1 ? '1. gün' : '6. gün';
  return (
    `<@${job.userId}> **Stat rebalance telafi paketin** hâlâ bekliyor (${dayLabel} hatırlatması).\n` +
    `⏳ **${job.daysLeft}** gün içinde \`${prefix} telafi\` ile alabilirsin — süre dolunca kaybolur.`
  );
}

/** Worker: claim edilmemiş telafiler için 1. ve 6. gün hatırlatma kuyruğa al. */
export async function scanCompensationReminders(prisma: PrismaClient, redis: Redis): Promise<number> {
  const now = new Date();
  const rows = await prisma.rebalanceCompensation.findMany({
    where: { claimedAt: null, expiresAt: { gt: now } },
    select: { id: true, playerId: true, createdAt: true, expiresAt: true },
  });

  let enqueued = 0;
  for (const row of rows) {
    const ageMs = now.getTime() - row.createdAt.getTime();
    const ageDays = ageMs / (24 * 60 * 60 * 1000);
    const daysLeft = daysUntilExpiry(row.expiresAt, now);

    let day: 1 | 6 | null = null;
    if (ageDays >= 0.8 && ageDays <= 1.5) day = 1;
    else if (ageDays >= 5.5 && ageDays <= 6.5) day = 6;
    if (!day) continue;

    const sentKey = `${SENT_PREFIX}${row.id}:d${day}`;
    const claimed = await redis.set(sentKey, '1', 'EX', 14 * 24 * 3600, 'NX');
    if (claimed !== 'OK') continue;

    const job: CompensationReminderJob = {
      userId: row.playerId,
      day,
      daysLeft,
      at: now.toISOString(),
    };
    await redis.rpush(QUEUE_KEY, JSON.stringify(job));
    enqueued++;
  }
  return enqueued;
}

export async function processCompensationReminderQueue(
  client: Client,
  redis: Redis,
  prisma: PrismaClient | null = null,
): Promise<number> {
  let sent = 0;
  for (let i = 0; i < 10; i++) {
    const raw = await redis.lpop(QUEUE_KEY);
    if (!raw) break;

    let job: CompensationReminderJob;
    try {
      job = JSON.parse(raw) as CompensationReminderJob;
    } catch {
      continue;
    }

    const text = buildCompensationReminderMessage(job);
    let delivered = false;

    try {
      const user = await client.users.fetch(job.userId);
      await user.send(text);
      delivered = true;
    } catch {
      // DM kapalı — kanal fallback
    }

    if (!delivered) {
      const target = await resolveFeedbackAnnounceTarget(redis, prisma, job.userId);
      if (target) {
        try {
          const channel = await client.channels.fetch(target.channelId);
          if (channel?.isTextBased() && 'send' in channel) {
            await channel.send(text);
            delivered = true;
          }
        } catch {
          // ignore
        }
      }
    }

    if (delivered) sent++;
  }
  return sent;
}
