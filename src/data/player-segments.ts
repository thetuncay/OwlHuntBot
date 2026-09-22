import segments from './player-segments.json';

const SEGMENTS: Record<string, string> = segments;

/** Oyuncu davranış verisinden kişiye özel onboarding ipucu */
export function getPlayerSegmentHint(userId: string): string | null {
  return SEGMENTS[userId] ?? null;
}
