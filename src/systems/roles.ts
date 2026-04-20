// ============================================================
// roles.ts — Otomatik Liderboard Rol Atama Sistemi
// Top oyunculara ozel Discord rolleri atar/kaldirir.
// Roller yoksa otomatik olusturulur, ID'ler Redis'e kaydedilir.
// ============================================================

import { type Client, type Guild, EmbedBuilder } from 'discord.js';
import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import { COLOR_SUCCESS } from '../config';
import { getLeaderboard, type LeaderboardCategory } from './leaderboard';

// ── Rol Tanimlari ─────────────────────────────────────────────────────────────

interface RoleDef {
  key: string;           // Redis'te saklanacak anahtar
  name: string;          // Discord'da gorunecek isim
  color: number;         // Hex renk
  category: LeaderboardCategory;
  rank: number;          // 1-bazli sira (1 = birinci)
}

export const ROLE_DEFINITIONS: RoleDef[] = [
  // Güç
  { key: 'POWER_1',  name: '👑 Zirvenin Sahibi',  color: 0xf1c40f, category: 'power',  rank: 1 },
  { key: 'POWER_2',  name: '🔥 Mutlak Hükümdar',  color: 0xe67e22, category: 'power',  rank: 2 },
  // Av
  { key: 'HUNT_1',   name: '🎯 Av Efsanesi',       color: 0x27ae60, category: 'hunt',   rank: 1 },
  { key: 'HUNT_2',   name: '🌲 Gölge Avcısı',      color: 0x2ecc71, category: 'hunt',   rank: 2 },
  { key: 'HUNT_3',   name: '🦉 Gece Yırtıcısı',    color: 0x1abc9c, category: 'hunt',   rank: 3 },
  // Nadir
  { key: 'RELIC_1',  name: '💎 Hazine Efendisi',   color: 0x9b59b6, category: 'relic',  rank: 1 },
  { key: 'RELIC_2',  name: '🔮 Gizem Avcısı',      color: 0x8e44ad, category: 'relic',  rank: 2 },
  // Arena
  { key: 'ARENA_1',  name: '⚔️ Arena Efsanesi',    color: 0xe74c3c, category: 'arena',  rank: 1 },
  { key: 'ARENA_2',  name: '🛡️ Savaş Tanrısı',     color: 0xc0392b, category: 'arena',  rank: 2 },
  // Servet
  { key: 'WEALTH_1', name: '💰 Altın Baron',        color: 0xf39c12, category: 'wealth', rank: 1 },
  { key: 'WEALTH_2', name: '🏦 Servet Mimarı',      color: 0xd4ac0d, category: 'wealth', rank: 2 },
];

const REDIS_ROLE_PREFIX = 'lb:role:';

// ── Redis'ten Rol ID Okuma/Yazma ──────────────────────────────────────────────

export async function getRoleId(redis: Redis, key: string): Promise<string | null> {
  // Once Redis'e bak, yoksa .env'e bak
  const fromRedis = await redis.get(`${REDIS_ROLE_PREFIX}${key}`);
  if (fromRedis) return fromRedis;
  const fromEnv = process.env[`ROLE_${key}`] ?? '';
  return fromEnv || null;
}

export async function setRoleId(redis: Redis, key: string, roleId: string): Promise<void> {
  await redis.set(`${REDIS_ROLE_PREFIX}${key}`, roleId);
}

/**
 * Tum rol ID'lerini Redis'ten okur.
 * Kategori → [roleId, ...] haritasi dondurur.
 */
export async function getAllRoleIds(redis: Redis): Promise<Record<string, string[]>> {
  const result: Record<string, string[]> = {
    power: [], hunt: [], relic: [], arena: [], wealth: [],
  };
  for (const def of ROLE_DEFINITIONS) {
    const id = await getRoleId(redis, def.key);
    if (id) result[def.category]?.push(id);
  }
  return result;
}

// ── Rol Olusturma ─────────────────────────────────────────────────────────────

/**
 * Sunucuda tum liderboard rollerini olusturur (yoksa).
 * Mevcut roller atlanir, yeni olusturulanlar Redis'e kaydedilir.
 * Sonuc embed'i dondurur.
 */
export async function createLeaderboardRoles(
  guild: Guild,
  redis: Redis,
): Promise<EmbedBuilder> {
  const created: string[] = [];
  const existing: string[] = [];
  const failed: string[] = [];

  for (const def of ROLE_DEFINITIONS) {
    try {
      // Zaten var mi kontrol et (isim eslesimi)
      const existingRole = guild.roles.cache.find((r) => r.name === def.name);

      if (existingRole) {
        // Varsa ID'yi kaydet (Redis'te yoksa)
        const savedId = await getRoleId(redis, def.key);
        if (!savedId) {
          await setRoleId(redis, def.key, existingRole.id);
        }
        existing.push(`${def.name} — <@&${existingRole.id}>`);
        continue;
      }

      // Yeni rol olustur
      const newRole = await guild.roles.create({
        name: def.name,
        color: def.color,
        hoist: false,          // Uye listesinde ayri gosterme
        mentionable: false,
        reason: 'BaykusBot liderboard rol sistemi',
      });

      await setRoleId(redis, def.key, newRole.id);
      created.push(`${def.name} — <@&${newRole.id}>`);
    } catch (err) {
      console.error(`[Roles] Rol olusturulamadi: ${def.name}`, err);
      failed.push(def.name);
    }
  }

  // Sonuc embed'i
  const embed = new EmbedBuilder()
    .setColor(COLOR_SUCCESS)
    .setTitle('🎖️ Liderboard Rolleri Hazır')
    .setTimestamp();

  if (created.length > 0) {
    embed.addFields({
      name: `✅ Oluşturuldu (${created.length})`,
      value: created.join('\n'),
      inline: false,
    });
  }

  if (existing.length > 0) {
    embed.addFields({
      name: `♻️ Zaten Mevcut (${existing.length})`,
      value: existing.join('\n'),
      inline: false,
    });
  }

  if (failed.length > 0) {
    embed.addFields({
      name: `❌ Başarısız (${failed.length})`,
      value: failed.join('\n'),
      inline: false,
    });
  }

  embed.setFooter({
    text: `Toplam ${ROLE_DEFINITIONS.length} rol · /admin lbsyncroles ile ata`,
  });

  return embed;
}

// ── Rol Atama ─────────────────────────────────────────────────────────────────

/**
 * Belirli bir kategori icin rol atamalarini gunceller.
 */
export async function syncCategoryRoles(
  guild: Guild,
  redis: Redis,
  prisma: PrismaClient,
  category: LeaderboardCategory,
): Promise<void> {
  // Bu kategoriye ait rol tanimlari
  const defs = ROLE_DEFINITIONS.filter((d) => d.category === category)
    .sort((a, b) => a.rank - b.rank);

  if (defs.length === 0) return;

  // Liderboard verisini al
  const lb = await getLeaderboard(prisma, redis, category);

  for (const def of defs) {
    const roleId = await getRoleId(redis, def.key);
    if (!roleId) continue;

    const role = guild.roles.cache.get(roleId);
    if (!role) {
      console.warn(`[Roles] Rol cache'de yok: ${def.name} (${roleId})`);
      continue;
    }

    const newHolder = lb.entries[def.rank - 1]; // rank 1 → index 0

    // Eski sahiplerin rollerini kaldir
    for (const [memberId, member] of role.members) {
      if (newHolder && memberId === newHolder.playerId) continue;
      await member.roles.remove(role, `Liderboard güncellendi — ${category} #${def.rank}`)
        .catch(() => null);
    }

    // Yeni sahibe rol ver
    if (newHolder) {
      const member = await guild.members.fetch(newHolder.playerId).catch(() => null);
      if (member && !member.roles.cache.has(roleId)) {
        await member.roles.add(role, `Liderboard #${def.rank} — ${category}`)
          .catch(() => null);
      }
    }
  }
}

/**
 * Tum kategorilerin rollerini senkronize eder.
 */
export async function syncAllRoles(
  client: Client,
  guildId: string,
  prisma: PrismaClient,
  redis: Redis,
): Promise<void> {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) {
    console.warn(`[Roles] Guild bulunamadi: ${guildId}`);
    return;
  }

  await guild.members.fetch().catch(() => null);

  const categories: LeaderboardCategory[] = ['power', 'hunt', 'relic', 'arena', 'wealth'];
  await Promise.allSettled(
    categories.map((cat) => syncCategoryRoles(guild, redis, prisma, cat)),
  );

  console.info(`[Roles] Tum kategori rolleri senkronize edildi.`);
}

/**
 * Tek bir oyuncunun tum liderboard rollerini kaldirir.
 */
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
    }
  }
}
