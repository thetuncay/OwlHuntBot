import segments from './owo-segments.json';

const SEGMENTS: Record<string, string> = segments;

/** OwO player_behavior export'undan oyuncuya özel onboarding ipucu */
export function getOwOSegmentHint(userId: string): string | null {
  return SEGMENTS[userId] ?? null;
}
