import { createHash } from 'node:crypto';

export type RetentionBucket = 'A' | 'B';

export interface RetentionTuning {
  socialBonusMult: number;
}

export function retentionBucketForUser(userId: string): RetentionBucket {
  const h = createHash('sha1').update(`retention:${userId}`).digest()[0] ?? 0;
  return h % 2 === 0 ? 'A' : 'B';
}

export function retentionTuningForUser(userId: string): RetentionTuning {
  const bucket = retentionBucketForUser(userId);
  if (bucket === 'A') {
    return { socialBonusMult: 1.0 };
  }
  // B: hafif sosyal bonus farklılaştırması (ekonomi güvenliği)
  return { socialBonusMult: 1.05 };
}
