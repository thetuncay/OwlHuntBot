import type { PrismaClient } from '@prisma/client';

/** Liderboard / web profilinde gösterilen oyuncu adı. */

const MIN_LEN = 2;
const MAX_LEN = 32;
const NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N} _.'-]*$/u;

export function resolvePlayerDisplayName(row: {
  leaderboardName?: string | null;
  registrations: { displayName: string | null; username: string }[];
}): string {
  const custom = row.leaderboardName?.trim();
  if (custom) return custom;
  return row.registrations[0]?.displayName ?? row.registrations[0]?.username ?? 'Oyuncu';
}

/** Kayıtlı Discord adı — özel leaderboard adı değil. */
export function resolveStoredDiscordDisplayName(row: {
  registrations: { displayName: string | null; username: string }[];
}): string | null {
  const reg = row.registrations[0];
  if (!reg) return null;
  return reg.displayName?.trim() || reg.username?.trim() || null;
}

/** Canlı Discord bağlamında sunucu/global görünen ad. */
export function resolveDiscordDisplayName(
  member: { displayName?: string | null } | null | undefined,
  user: { displayName?: string; username: string },
): string {
  return member?.displayName?.trim()
    || user.displayName?.trim()
    || user.username;
}

/** Baykuş sahibi Discord adları (leaderboard alias hariç). */
export async function fetchPlayerDiscordNames(
  prisma: PrismaClient,
  playerIds: string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(playerIds.filter(Boolean))];
  if (unique.length === 0) return new Map();

  const players = await prisma.player.findMany({
    where: { id: { in: unique } },
    select: {
      id: true,
      registrations: { select: { displayName: true, username: true }, take: 1 },
    },
  });

  return new Map(
    players.map((p) => {
      const name = resolveStoredDiscordDisplayName(p) ?? 'Oyuncu';
      return [p.id, name];
    }),
  );
}

export function validateLeaderboardDisplayName(raw: string): string {
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length < MIN_LEN) {
    throw new Error(`Görünen ad en az ${MIN_LEN} karakter olmalı.`);
  }
  if (name.length > MAX_LEN) {
    throw new Error(`Görünen ad en fazla ${MAX_LEN} karakter olabilir.`);
  }
  if (!NAME_RE.test(name)) {
    throw new Error('Görünen ad yalnızca harf, rakam, boşluk ve . _ \' - içerebilir.');
  }
  return name;
}
