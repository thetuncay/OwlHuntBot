import { NEWBIE_BOOST_DAYS, NEWBIE_LUCK_BONUS, NEWBIE_XP_MULTIPLIER } from '../config';

export function newbieBoostDaysLeft(createdAt: Date, now = new Date()): number {
  const endMs = createdAt.getTime() + NEWBIE_BOOST_DAYS * 86_400_000;
  const left = Math.ceil((endMs - now.getTime()) / 86_400_000);
  return Math.max(0, left);
}

export function isNewbieActive(createdAt: Date, now = new Date()): boolean {
  return newbieBoostDaysLeft(createdAt, now) > 0;
}

export function getNewbieLuckBonus(createdAt: Date, now = new Date()): number {
  return isNewbieActive(createdAt, now) ? NEWBIE_LUCK_BONUS : 0;
}

export function applyNewbieXpMultiplier(rawXp: number, createdAt: Date, now = new Date()): number {
  if (!isNewbieActive(createdAt, now) || rawXp <= 0) return rawXp;
  return Math.round(rawXp * NEWBIE_XP_MULTIPLIER);
}

export function formatNewbieBoostLine(createdAt: Date, now = new Date()): string | null {
  const daysLeft = newbieBoostDaysLeft(createdAt, now);
  if (daysLeft <= 0) return null;
  return `🌱 Yeni oyuncu bonusu aktif — ${daysLeft} gün kaldı`;
}
