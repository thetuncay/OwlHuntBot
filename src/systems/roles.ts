// ============================================================
// roles.ts — Liderboard ödül rolleri (3 rol, tek #1 per kategori)
// ============================================================

import {
  type Client,
  type Guild,
  type GuildMember,
  type Role,
  EmbedBuilder,
  PermissionFlagsBits,
} from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import { COIN_EMOJI, XP_EMOJI } from '../config/ui-emojis';
import type Redis from 'ioredis';
import {
  COLOR_SUCCESS,
  LEADERBOARD_ROLE_STEAL_CHANNEL_ID,
  MAIN_GUILD_ID,
} from '../config';
import { getLeaderboard, type LeaderboardCategory } from './leaderboard';
import type { LeaderboardEntry } from './leaderboard-types';
import { buildDetail, playerScoreForCategory } from './leaderboard-queries';
import { resolvePlayerDisplayName } from '../utils/player-display-name';

// ── Rol Tanimlari ─────────────────────────────────────────────────────────────

interface RoleDef {
  key: string;
  name: string;
  color: number;
  category: LeaderboardCategory;
  /** Discord hiyerarşisinde sıra (yüksek = daha üstte). */
  stackOrder: number;
}

/** Sadece power / arena / wealth — her biri için tek #1 rolü. */
export const ROLE_DEFINITIONS: RoleDef[] = [
  { key: 'WEALTH_1', name: 'Altın Baronu 💰',      color: 0xf39c12, category: 'wealth', stackOrder: 1 },
  { key: 'ARENA_1',  name: 'Arenanın babası ⚔️',   color: 0xe74c3c, category: 'arena',  stackOrder: 2 },
  { key: 'POWER_1',  name: '👑 İmparator',          color: 0xf1c40f, category: 'power',  stackOrder: 3 },
];

const ROLE_CATEGORIES: LeaderboardCategory[] = ['power', 'arena', 'wealth'];

const STEAL_ANNOUNCEMENT_FLAVOR: Record<
  'power' | 'arena' | 'wealth',
  { headline: string; tagline: string; categoryLabel: string; scoreLabel: string; takeoverNoun: string; holderLine: (name: string) => string }
> = {
  power: {
    headline: '👑İMPARATOR TAHTI EL DEĞİŞTİ',
    tagline: 'Taç yeni sahibine geçti..',
    categoryLabel: 'Güç',
    scoreLabel: 'Güç Puanı',
    takeoverNoun: 'imparatorluk tacını',
    holderLine: (name) => `**${name}** tahtı devraldı.`,
  },
  arena: {
    headline: '⚔️ ARENA TAHTI EL DEĞİŞTİRDİ',
    tagline: 'Arenanın yeni sahibi artık başka bir avcının.',
    categoryLabel: 'Arena',
    scoreLabel: 'Galibiyet',
    takeoverNoun: 'arena tacını',
    holderLine: (name) => `**${name}** tahtı devraldı.`,
  },
  wealth: {
    headline: '💰 ALTIN BARONU DEĞİŞTİ',
    tagline: 'Servet sıralaması değşti..',
    categoryLabel: 'Servet',
    scoreLabel: 'Servet',
    takeoverNoun: 'altın tacını',
    holderLine: (name) => `**${name}** yeni altın baronu.`,
  },
};

const REDIS_ROLE_PREFIX = 'lb:role:';
const REDIS_HOLDER_PREFIX = 'lb:role:holder:';

export interface RoleStealEvent {
  roleKey: string;
  roleId: string;
  roleName: string;
  category: 'power' | 'arena' | 'wealth';
  scoreLabel: string;
  newHolderId: string;
  newHolderName: string;
  newScore: number;
  newDetail: string;
  oldHolderId: string;
  oldHolderName: string;
  oldScore: number;
  oldDetail: string;
}

function formatStealScore(score: number, label: string): string {
  return `**${score.toLocaleString('tr-TR')}** ${label}`;
}

function formatStealScoreGap(newScore: number, oldScore: number, label: string): string {
  const gap = newScore - oldScore;
  if (gap > 0) return `**+${gap.toLocaleString('tr-TR')}** ${label}`;
  if (gap < 0) return `**${gap.toLocaleString('tr-TR')}** ${label}`;
  return `**0** ${label}`;
}

const STEAL_HOLDER_SELECT = {
  leaderboardName: true,
  powerScore: true,
  totalHunts: true,
  totalRareFinds: true,
  totalPvpWins: true,
  totalCoinsEarned: true,
  totalCoinsLost: true,
  pvpCount: true,
  level: true,
  xp: true,
  coins: true,
  registrations: { select: { displayName: true, username: true }, take: 1 },
} as const;

async function resolveStealHolderSnapshot(
  prisma: PrismaClient,
  redis: Redis,
  category: LeaderboardCategory,
  playerId: string,
  lbEntries: LeaderboardEntry[],
): Promise<{ displayName: string; score: number; detail: string }> {
  const cached = lbEntries.find((e) => e.playerId === playerId);
  if (cached) {
    return { displayName: cached.displayName, score: cached.score, detail: cached.detail };
  }

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: STEAL_HOLDER_SELECT,
  });
  if (!player) {
    throw new Error(`<@${playerId}> kayıtlı oyuncu değil.`);
  }

  return {
    displayName: resolvePlayerDisplayName(player),
    score: playerScoreForCategory(category, { id: playerId, ...player }),
    detail: buildDetail(category, player),
  };
}

/** Gerçek skor/rol verisiyle duyuru event'i oluşturur (test veya sync). */
export async function buildRoleStealEvent(
  prisma: PrismaClient,
  redis: Redis,
  category: 'power' | 'arena' | 'wealth',
  newHolderId: string,
  oldHolderId: string,
): Promise<RoleStealEvent> {
  const def = ROLE_DEFINITIONS.find((d) => d.category === category);
  if (!def) throw new Error(`Bilinmeyen kategori: ${category}`);

  const roleId = await getRoleId(redis, def.key);
  if (!roleId) {
    throw new Error(`**${def.name}** rolü bulunamadı. Önce \`/admin lb siralama\` çalıştır.`);
  }

  const lb = await getLeaderboard(prisma, redis, category);
  const [newHolder, oldHolder] = await Promise.all([
    resolveStealHolderSnapshot(prisma, redis, category, newHolderId, lb.entries),
    resolveStealHolderSnapshot(prisma, redis, category, oldHolderId, lb.entries),
  ]);
  const flavor = STEAL_ANNOUNCEMENT_FLAVOR[category];

  return {
    roleKey: def.key,
    roleId,
    roleName: def.name,
    category,
    scoreLabel: flavor.scoreLabel,
    newHolderId,
    newHolderName: newHolder.displayName,
    newScore: newHolder.score,
    newDetail: newHolder.detail,
    oldHolderId,
    oldHolderName: oldHolder.displayName,
    oldScore: oldHolder.score,
    oldDetail: oldHolder.detail,
  };
}

// ── Redis ─────────────────────────────────────────────────────────────────────

export async function getRoleId(redis: Redis, key: string): Promise<string | null> {
  const fromRedis = await redis.get(`${REDIS_ROLE_PREFIX}${key}`);
  if (fromRedis) return fromRedis;
  const fromEnv = process.env[`ROLE_${key}`] ?? '';
  return fromEnv || null;
}

export async function setRoleId(redis: Redis, key: string, roleId: string): Promise<void> {
  await redis.set(`${REDIS_ROLE_PREFIX}${key}`, roleId);
}

async function getStoredHolder(redis: Redis, key: string): Promise<string | null> {
  return redis.get(`${REDIS_HOLDER_PREFIX}${key}`);
}

async function setStoredHolder(redis: Redis, key: string, playerId: string | null): Promise<void> {
  const redisKey = `${REDIS_HOLDER_PREFIX}${key}`;
  if (playerId) {
    await redis.set(redisKey, playerId);
    return;
  }
  await redis.del(redisKey);
}

export async function getAllRoleIds(redis: Redis): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {
    power: [], hunt: [], arena: [], wealth: [],
  };
  for (const def of ROLE_DEFINITIONS) {
    const id = await getRoleId(redis, def.key);
    if (id) result[def.category]?.push(id);
  }
  return result;
}

// ── Oyuncu adı ────────────────────────────────────────────────────────────────

async function resolveHolderDisplayName(
  prisma: PrismaClient,
  playerId: string,
): Promise<string> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: {
      leaderboardName: true,
      registrations: { select: { displayName: true, username: true }, take: 1 },
    },
  });
  if (!player) return 'Bilinmeyen';
  return resolvePlayerDisplayName(player);
}

// ── Rol oluşturma ve sıralama ─────────────────────────────────────────────────

export interface LeaderboardRolePositionPlan {
  roleKey: string;
  roleName: string;
  targetPosition: number;
}

/** Bot rolünün hemen altına liderboard rollerini yerleştirmek için hedef pozisyonlar. */
export function planLeaderboardRolePositions(
  botRolePosition: number,
  roles: Array<{ key: string; name: string }>,
): LeaderboardRolePositionPlan[] {
  const count = roles.length;
  if (count === 0 || botRolePosition < 2) return [];

  return roles.map((role, idx) => ({
    roleKey: role.key,
    roleName: role.name,
    targetPosition: Math.max(1, botRolePosition - (count - idx)),
  }));
}

function canBotMoveRole(guild: Guild, me: GuildMember, role: Role): boolean {
  if (role.managed || role.id === guild.id) return false;
  return guild.roles.comparePositions(me.roles.highest, role) > 0;
}

async function positionLeaderboardRoles(
  guild: Guild,
  roleByKey: Map<string, Role>,
): Promise<{ positioned: number; skipped: string[] }> {
  const me = guild.members.me;
  if (!me) return { positioned: 0, skipped: ['bot üyesi bulunamadı'] };

  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    console.warn('[Roles] Manage Roles izni yok — hiyerarşi atlandı.');
    return { positioned: 0, skipped: ['Manage Roles izni yok'] };
  }

  const botRole = me.roles.highest;
  const sorted = [...ROLE_DEFINITIONS].sort((a, b) => a.stackOrder - b.stackOrder);
  const movable = sorted
    .map((def) => {
      const role = roleByKey.get(def.key);
      if (!role) return null;
      return { def, role };
    })
    .filter((row): row is { def: RoleDef; role: Role } => row != null);

  if (movable.length === 0) {
    return { positioned: 0, skipped: ['taşınabilir rol yok'] };
  }

  const blocked = movable
    .filter(({ role }) => !canBotMoveRole(guild, me, role))
    .map(({ def }) => def.name);

  const editable = movable.filter(({ role }) => canBotMoveRole(guild, me, role));
  if (editable.length === 0) {
    console.warn(
      `[Roles] Liderboard rolleri bot rolünün (${botRole.name}, pos=${botRole.position}) altında değil. ` +
      'Sunucu Ayarları → Roller bölümünde bot rolünü bu rollerin üstüne taşıyın.',
    );
    return { positioned: 0, skipped: blocked };
  }

  const plan = planLeaderboardRolePositions(
    botRole.position,
    editable.map(({ def }) => ({ key: def.key, name: def.name })),
  );

  if (plan.length === 0) {
    console.warn(
      `[Roles] Bot rolü (pos=${botRole.position}) çok alçak — liderboard hiyerarşisi ayarlanamadı.`,
    );
    return { positioned: 0, skipped: [...blocked, 'bot rolü çok alçak'] };
  }

  let positioned = 0;
  for (const { roleKey, targetPosition } of plan) {
    const row = editable.find((e) => e.def.key === roleKey);
    if (!row) continue;
    if (row.role.position === targetPosition) {
      positioned += 1;
      continue;
    }

    try {
      // guild.roles.setPositions yerine tek rol API'si — tüm rol sırasını gönderir, 50013 riski düşer.
      await row.role.setPosition(targetPosition);
      positioned += 1;
    } catch (err) {
      console.warn(
        `[Roles] ${row.role.name} konumu ayarlanamadı (hedef=${targetPosition}, botTop=${botRole.position}):`,
        err,
      );
    }
  }

  if (blocked.length > 0) {
    console.warn(
      `[Roles] Hiyerarşi atlandı (bot rolünün altında değil): ${blocked.join(', ')}`,
    );
  }

  return { positioned, skipped: blocked };
}

async function upsertRole(
  guild: Guild,
  redis: Redis,
  def: RoleDef,
): Promise<{ role: Role; created: boolean } | null> {
  try {
    const savedId = await getRoleId(redis, def.key);
    if (savedId) {
      const cached = guild.roles.cache.get(savedId);
      if (cached) return { role: cached, created: false };
      const fetched = await guild.roles.fetch(savedId).catch(() => null);
      if (fetched) return { role: fetched, created: false };
    }

    const byName = guild.roles.cache.find((r) => r.name === def.name);
    if (byName) {
      await setRoleId(redis, def.key, byName.id);
      return { role: byName, created: false };
    }

    const created = await guild.roles.create({
      name: def.name,
      color: def.color,
      hoist: true,
      mentionable: false,
      reason: 'BaykuşBot liderboard ödül rolü',
    });
    await setRoleId(redis, def.key, created.id);
    return { role: created, created: true };
  } catch (err) {
    console.error(`[Roles] Rol hazırlanamadı: ${def.name}`, err);
    return null;
  }
}

/**
 * Eksik rolleri oluşturur, hiyerarşiyi ayarlar (İmparator en üstte).
 */
export async function ensureLeaderboardRoles(
  guild: Guild,
  redis: Redis,
): Promise<void> {
  const roleByKey = new Map<string, Role>();

  for (const def of ROLE_DEFINITIONS) {
    const result = await upsertRole(guild, redis, def);
    if (result) roleByKey.set(def.key, result.role);
  }

  await positionLeaderboardRoles(guild, roleByKey);
}

export async function createLeaderboardRoles(
  guild: Guild,
  redis: Redis,
): Promise<EmbedBuilder> {
  const created: string[] = [];
  const existing: string[] = [];
  const failed: string[] = [];
  const roleByKey = new Map<string, Role>();

  for (const def of ROLE_DEFINITIONS) {
    const beforeId = await getRoleId(redis, def.key);
    const result = await upsertRole(guild, redis, def);
    if (!result) {
      failed.push(def.name);
      continue;
    }
    roleByKey.set(def.key, result.role);
    const line = `${def.name} — <@&${result.role.id}>`;
    if (result.created || !beforeId) created.push(line);
    else existing.push(line);
  }

  const positionResult = await positionLeaderboardRoles(guild, roleByKey);

  const embed = new EmbedBuilder()
    .setColor(COLOR_SUCCESS)
    .setTitle('🎖️ Liderboard Rolleri Hazır')
    .setDescription(
      `Sıra (yukarıdan aşağı): **👑 İmparator** → **Arenanın babası ⚔️** → **Altın Baronu ${COIN_EMOJI}**`,
    )
    .setTimestamp();

  if (created.length > 0) {
    embed.addFields({ name: `✅ Oluşturuldu (${created.length})`, value: created.join('\n') });
  }
  if (existing.length > 0) {
    embed.addFields({ name: `♻️ Zaten Mevcut (${existing.length})`, value: existing.join('\n') });
  }
  if (failed.length > 0) {
    embed.addFields({ name: `❌ Başarısız (${failed.length})`, value: failed.join('\n') });
  }
  if (positionResult.skipped.length > 0 || positionResult.positioned < ROLE_DEFINITIONS.length) {
    embed.addFields({
      name: '⚠️ Rol sırası',
      value:
        'Bot rolü liderboard rollerinin **üstünde** olmalı ve **Rolleri Yönet** izni gerekir. ' +
        'Sunucu Ayarları → Roller\'den bot rolünü yukarı taşıyıp `/admin lb syncroles` tekrar çalıştırın.',
    });
  }

  embed.setFooter({
    text: `${ROLE_DEFINITIONS.length} rol · /admin lb syncroles ile ata`,
  });

  return embed;
}

// ── Rol çalma duyurusu ────────────────────────────────────────────────────────

/**
 * Beraberlikte mevcut rol sahibini korur; skor farkı oluşunca yalnızca gerçek geçişte değişir.
 */
export function resolveLeaderboardRoleHolder(
  entries: LeaderboardEntry[],
  prevHolderId: string | null,
): string | null {
  if (entries.length === 0) return null;

  const topScore = entries[0]!.score;
  const tiedTop = entries.filter((e) => e.score === topScore);

  if (tiedTop.length > 1) {
    if (prevHolderId && tiedTop.some((e) => e.playerId === prevHolderId)) {
      return prevHolderId;
    }
    const stableWinner = [...tiedTop].sort((a, b) => a.playerId.localeCompare(b.playerId))[0]!;
    return stableWinner.playerId;
  }

  return entries[0]!.playerId;
}

export function formatRoleStealAnnouncement(event: RoleStealEvent): string {
  return (
    `<@&${event.roleId}> → <@${event.newHolderId}> ` +
    `**${event.roleName}** tacını <@${event.oldHolderId}> oyuncusundan kaptı!`
  );
}

export function buildRoleStealEmbed(event: RoleStealEvent): EmbedBuilder {
  const flavor = STEAL_ANNOUNCEMENT_FLAVOR[event.category];
  const def = ROLE_DEFINITIONS.find((d) => d.key === event.roleKey);
  const color = def?.color ?? 0xf1c40f;

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(flavor.headline)
    .setDescription(
      `<@&${event.roleId}>\n\n` +
      `${flavor.holderLine(event.newHolderName)}\n\n` +
      `> *${flavor.tagline}*`,
    )
    .addFields(
      {
        name: '🏆 Yeni #1',
        value:
          `<@${event.newHolderId}>\n` +
          `${formatStealScore(event.newScore, event.scoreLabel)}\n` +
          `↳ *${event.newDetail}*`,
        inline: true,
      },
      {
        name: '📉 Tahtı kaybeden',
        value:
          `<@${event.oldHolderId}>\n` +
          `${formatStealScore(event.oldScore, event.scoreLabel)}\n` +
          `↳ *${event.oldDetail}*`,
        inline: true,
      },
      {
        name: '⚡ Üstünlük',
        value: formatStealScoreGap(event.newScore, event.oldScore, event.scoreLabel),
        inline: true,
      },
    )
    .setFooter({ text: `${flavor.categoryLabel} liderboard · \`w lb\` ile sıralamayı gör` })
    .setTimestamp();
}

function buildRoleStealWonDm(event: RoleStealEvent): EmbedBuilder {
  const def = ROLE_DEFINITIONS.find((d) => d.key === event.roleKey);
  const color = def?.color ?? 0xf1c40f;
  const flavor = STEAL_ANNOUNCEMENT_FLAVOR[event.category];

  // DM'de <@&role> çözülmez → bilinmeyen rol; isim metin olarak yazılır.
  return new EmbedBuilder()
    .setColor(color)
    .setTitle('🎉 Zirveye girdin!')
    .setDescription(
      `**${event.roleName}** artık sende!\n\n` +
      `${formatStealScore(event.newScore, event.scoreLabel)}\n` +
      `*${event.newDetail}*\n\n` +
      `<@${event.oldHolderId}> (**${formatStealScore(event.oldScore, event.scoreLabel)}**) geride kaldı.\n\n` +
      `> *${flavor.tagline}*`,
    )
    .setTimestamp();
}

function buildRoleStealLostDm(event: RoleStealEvent): EmbedBuilder {
  const flavor = STEAL_ANNOUNCEMENT_FLAVOR[event.category];

  // DM'de <@&role> çözülmez → bilinmeyen rol; isim metin olarak yazılır.
  return new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('💔 Tacı kaybettin')
    .setDescription(
      `**${event.roleName}** artık sende değil.\n\n` +
      `<@${event.newHolderId}> (**${event.newHolderName}**) seni geçti:\n` +
      `${formatStealScore(event.newScore, event.scoreLabel)} · *${event.newDetail}*\n\n` +
      `Senin skorun: ${formatStealScore(event.oldScore, event.scoreLabel)} · *${event.oldDetail}*\n\n` +
      `> *${flavor.tagline} Geri dön.*`,
    )
    .setTimestamp();
}

export async function announceRoleSteals(
  client: Client,
  events: RoleStealEvent[],
  opts?: { sendDm?: boolean },
): Promise<void> {
  if (events.length === 0) return;
  const sendDm = opts?.sendDm ?? true;

  const channel = await client.channels.fetch(LEADERBOARD_ROLE_STEAL_CHANNEL_ID).catch(() => null);
  const canPost = channel?.isTextBased() && 'send' in channel;

  for (const event of events) {
    const embed = buildRoleStealEmbed(event);
    const mentionIds = [event.newHolderId, event.oldHolderId];

    if (canPost) {
      await channel.send({
        content: `🔔 ${formatRoleStealAnnouncement(event)}`,
        embeds: [embed],
        allowedMentions: { users: mentionIds, roles: [event.roleId] },
      }).catch((err) => {
        console.warn('[Roles] Çalma duyurusu gönderilemedi:', err);
      });
    }

    const [newUser, oldUser] = await Promise.all([
      client.users.fetch(event.newHolderId).catch(() => null),
      client.users.fetch(event.oldHolderId).catch(() => null),
    ]);

    if (sendDm && newUser) {
      await newUser.send({
        embeds: [buildRoleStealWonDm(event)],
        allowedMentions: { users: [event.oldHolderId] },
      }).catch(() => null);
    }
    if (sendDm && oldUser) {
      await oldUser.send({
        embeds: [buildRoleStealLostDm(event)],
        allowedMentions: { users: [event.newHolderId] },
      }).catch(() => null);
    }
  }
}

// ── Rol atama ─────────────────────────────────────────────────────────────────

async function syncCategoryRoles(
  guild: Guild,
  redis: Redis,
  prisma: PrismaClient,
  category: LeaderboardCategory,
): Promise<RoleStealEvent[]> {
  const steals: RoleStealEvent[] = [];
  const def = ROLE_DEFINITIONS.find((d) => d.category === category);
  if (!def) return steals;

  const roleId = await getRoleId(redis, def.key);
  if (!roleId) return steals;

  const role = guild.roles.cache.get(roleId)
    ?? await guild.roles.fetch(roleId).catch(() => null);
  if (!role) {
    console.warn(`[Roles] Rol bulunamadı: ${def.name} (${roleId})`);
    return steals;
  }

  const lb = await getLeaderboard(prisma, redis, category);
  const prevHolderId = await getStoredHolder(redis, def.key);
  const newHolderId = resolveLeaderboardRoleHolder(lb.entries, prevHolderId);
  const newHolder = newHolderId
    ? lb.entries.find((e) => e.playerId === newHolderId) ?? lb.entries[0]
    : undefined;

  const candidateIds = new Set<string>([
    ...role.members.keys(),
    ...(newHolderId ? [newHolderId] : []),
    ...(prevHolderId ? [prevHolderId] : []),
  ]);

  const membersById = new Map<string, GuildMember>();
  await Promise.all([...candidateIds].map(async (id) => {
    const cached = guild.members.cache.get(id);
    if (cached) {
      membersById.set(id, cached);
      return;
    }
    const fetched = await guild.members.fetch(id).catch(() => null);
    if (fetched) membersById.set(id, fetched);
  }));

  for (const [memberId, member] of membersById) {
    if (!member.roles.cache.has(roleId)) continue;
    if (newHolderId && memberId === newHolderId) continue;
    await member.roles.remove(role, `Liderboard güncellendi — ${category}`).catch(() => null);
  }

  if (newHolderId) {
    const member = membersById.get(newHolderId)
      ?? await guild.members.fetch(newHolderId).catch(() => null);
    if (member && !member.roles.cache.has(roleId)) {
      await member.roles.add(role, `Liderboard #1 — ${category}`).catch(() => null);
    }
  }

  if (
    newHolderId
    && prevHolderId
    && prevHolderId !== newHolderId
  ) {
    const [newName, oldName] = await Promise.all([
      newHolder?.displayName ?? resolveHolderDisplayName(prisma, newHolderId),
      resolveHolderDisplayName(prisma, prevHolderId),
    ]);
    const event = await buildRoleStealEvent(
      prisma,
      redis,
      def.category as 'power' | 'arena' | 'wealth',
      newHolderId,
      prevHolderId,
    );
    steals.push({
      ...event,
      newHolderName: newName,
      oldHolderName: oldName,
    });
  }

  await setStoredHolder(redis, def.key, newHolderId);
  return steals;
}

export async function syncAllRoles(
  client: Client,
  guildId: string = MAIN_GUILD_ID,
  prisma: PrismaClient,
  redis: Redis,
): Promise<void> {
  const guild = client.guilds.cache.get(guildId)
    ?? await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    console.warn(`[Roles] Guild bulunamadı: ${guildId}`);
    return;
  }

  await ensureLeaderboardRoles(guild, redis);

  const stealEvents: RoleStealEvent[] = [];
  for (const category of ROLE_CATEGORIES) {
    const events = await syncCategoryRoles(guild, redis, prisma, category);
    stealEvents.push(...events);
  }

  await announceRoleSteals(client, stealEvents);
  console.info(`[Roles] Liderboard rolleri senkronize edildi (${stealEvents.length} çalma).`);
}

export async function removeAllLeaderboardRoles(
  guild: Guild,
  redis: Redis,
  playerId: string,
): Promise<void> {
  const member = await guild.members.fetch(playerId).catch(() => null);
  if (!member) return;

  for (const def of ROLE_DEFINITIONS) {
    const roleId = await getRoleId(redis, def.key);
    if (roleId && member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId, 'Liderboard rol temizleme').catch(() => null);
      if (await getStoredHolder(redis, def.key) === playerId) {
        await setStoredHolder(redis, def.key, null);
      }
    }
  }
}
