import { describe, expect, it } from 'vitest';
import {
  buildFeedbackAnnounceMessage,
  enqueueFeedbackAnnounce,
  feedbackSurveyLoginUrl,
} from '../systems/feedback-announce';

describe('feedback-announce', () => {
  it('builds mention message with survey link', () => {
    process.env.WEB_PUBLIC_URL = 'https://owlhunt.thetuncay.com';
    const msg = buildFeedbackAnnounceMessage({
      userId: '123456789',
      rewardCoins: 5000,
      rewardLootboxQty: 5,
      at: new Date().toISOString(),
    });
    expect(msg).toContain('<@123456789>');
    expect(msg).toContain('5.000');
    expect(msg).toContain('5');
    expect(msg).toContain(feedbackSurveyLoginUrl());
    expect(msg).toContain('/login?next=%2Ffeedback');
  });

  it('enqueues announce only once per user', async () => {
    const queue: string[] = [];
    const sent = new Set<string>();
    const redis = {
      async set(key: string, _val: string, _ex: string, _ttl: number, nx: string) {
        if (nx !== 'NX') return 'OK';
        if (sent.has(key)) return null;
        sent.add(key);
        return 'OK';
      },
      async rpush(_key: string, payload: string) {
        queue.push(payload);
      },
    };
    const job = { userId: '999', rewardCoins: 5000, rewardLootboxQty: 5 };
    await enqueueFeedbackAnnounce(redis as never, job);
    await enqueueFeedbackAnnounce(redis as never, job);
    expect(queue).toHaveLength(1);
  });
});
