/**
 * Anket tamamlama duyurusu — ops-panel Redis kuyruğu, shard 0 Discord'a yazar.
 * Her kullanıcı için en çok komut kullandığı kanala tek mesaj.
 */
import { formatCoinLabel } from '../config/ui-emojis';
import type { Client } from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { webPublicUrl } from '../ops/discord-oauth';
import { resolveFeedbackAnnounceTarget } from '../utils/user-command-channel';

const QUEUE_KEY = 'queue:feedback_announce';
const SENT_KEY_PREFIX = 'feedback:announce:sent:';

export interface FeedbackAnnounceJob {
  userId: string;
  rewardCoins: number;
  rewardLootboxQty: number;
  guildId?: string;
  channelId?: string;
  at: string;
}

export function feedbackSurveyLoginUrl(): string {
  const base = webPublicUrl();
  return `${base}/login?next=${encodeURIComponent('/feedback')}`;
}

export function buildFeedbackAnnounceMessage(job: FeedbackAnnounceJob): string {
  const link = feedbackSurveyLoginUrl();
  return `<@${job.userId}> anketi tamamlayıp ${formatCoinLabel(job.rewardCoins)} ve **${job.rewardLootboxQty}** kutu kazandı — sen de çözmek için: ${link}`;
}

export function isFeedbackAnnounceEnabled(): boolean {
  const raw = process.env.FEEDBACK_ANNOUNCE_ENABLED;
  if (raw === undefined || raw === '') return true;
  return raw === '1' || raw.toLowerCase() === 'true' || raw.toLowerCase() === 'yes';
}

export async function enqueueFeedbackAnnounce(
  redis: Redis,
  job: Omit<FeedbackAnnounceJob, 'at'>,
): Promise<void> {
  if (!isFeedbackAnnounceEnabled()) return;

  const sentKey = `${SENT_KEY_PREFIX}${job.userId}`;
  const claimed = await redis.set(sentKey, '1', 'EX', 365 * 24 * 3600, 'NX');
  if (claimed !== 'OK') return;

  const payload: FeedbackAnnounceJob = { ...job, at: new Date().toISOString() };
  await redis.rpush(QUEUE_KEY, JSON.stringify(payload));
}

async function resolveJobChannel(
  redis: Redis,
  prisma: PrismaClient | null,
  job: FeedbackAnnounceJob,
): Promise<{ guildId: string; channelId: string } | null> {
  if (job.guildId && job.channelId) {
    return { guildId: job.guildId, channelId: job.channelId };
  }
  return resolveFeedbackAnnounceTarget(redis, prisma, job.userId);
}

export async function processFeedbackAnnounceQueue(
  client: Client,
  redis: Redis,
  prisma: PrismaClient | null = null,
): Promise<number> {
  if (!isFeedbackAnnounceEnabled()) return 0;

  let sent = 0;
  for (let i = 0; i < 10; i++) {
    const raw = await redis.lpop(QUEUE_KEY);
    if (!raw) break;

    let job: FeedbackAnnounceJob;
    try {
      job = JSON.parse(raw) as FeedbackAnnounceJob;
    } catch {
      console.warn('[FeedbackAnnounce] Gecersiz kuyruk kaydi:', raw.slice(0, 120));
      continue;
    }

    const target = await resolveJobChannel(redis, prisma, job);
    if (!target) {
      console.warn('[FeedbackAnnounce] Kanal bulunamadi, userId=', job.userId);
      continue;
    }

    try {
      const channel = await client.channels.fetch(target.channelId);
      if (!channel?.isTextBased() || !('send' in channel)) {
        console.warn('[FeedbackAnnounce] Kanal metin kanali degil:', target.channelId);
        continue;
      }
      await channel.send({
        content: buildFeedbackAnnounceMessage(job),
        allowedMentions: { users: [job.userId] },
      });
      sent++;
    } catch (err) {
      console.error('[FeedbackAnnounce] Gonderim hatasi:', err instanceof Error ? err.message : err);
      await redis.rpush(QUEUE_KEY, raw);
      break;
    }
  }

  return sent;
}

export async function feedbackAnnounceQueueDepth(redis: Redis): Promise<number> {
  return redis.llen(QUEUE_KEY);
}
