/**
 * guild-directory.ts — Live guild list from Discord shards (ops panel).
 */
import type { Client, Guild, ShardingManager } from 'discord.js';
import type { Redis } from 'ioredis';
import { hourBucketKey } from './command-analytics';
import {
  OPS_GUILD_DIRECTORY_KEY,
  OPS_GUILD_DIRECTORY_TTL_SEC,
} from './ops-config';
import { getMaxGuilds } from '../utils/launch-config';

export interface LiveGuildEntry {
  id: string;
  name: string;
  memberCount: number;
  ownerId: string;
  joinedAt: number;
  iconUrl: string | null;
  premiumTier: number;
  shardId: number;
  commandsHour: number;
  commands24h: number;
}

export interface GuildDirectoryResponse {
  collectedAt: string;
  total: number;
  maxGuilds: number;
  atCap: boolean;
  source?: 'live' | 'cache';
  guilds: LiveGuildEntry[];
}

type GuildRow = {
  id: string;
  name: string;
  memberCount: number;
  ownerId: string;
  joinedAt: number;
  iconUrl: string | null;
  premiumTier: number;
  shardId: number;
};

function guildToRow(g: Guild, shardId = 0): GuildRow {
  return {
    id: g.id,
    name: g.name,
    memberCount: g.memberCount,
    ownerId: g.ownerId,
    joinedAt: g.joinedAt?.getTime() ?? 0,
    iconUrl: g.iconURL({ size: 128 }),
    premiumTier: g.premiumTier,
    shardId,
  };
}

async function fetchGuildRowsFromClient(client: Client): Promise<GuildRow[]> {
  if (client.shard) {
    const batches = (await client.shard.broadcastEval((c) =>
      [...c.guilds.cache.values()].map((g) => ({
        id: g.id,
        name: g.name,
        memberCount: g.memberCount,
        ownerId: g.ownerId,
        joinedAt: g.joinedAt?.getTime() ?? 0,
        iconUrl: g.iconURL({ size: 128 }),
        premiumTier: g.premiumTier,
        shardId: c.shard?.ids[0] ?? 0,
      })),
    )) as GuildRow[][];
    return batches.flat();
  }
  return [...client.guilds.cache.values()].map((g) => guildToRow(g));
}

async function fetchGuildRowsFromManager(manager: ShardingManager): Promise<GuildRow[]> {
  const batches = (await manager.broadcastEval((c) =>
    [...c.guilds.cache.values()].map((g) => ({
      id: g.id,
      name: g.name,
      memberCount: g.memberCount,
      ownerId: g.ownerId,
      joinedAt: g.joinedAt?.getTime() ?? 0,
      iconUrl: g.iconURL({ size: 128 }),
      premiumTier: g.premiumTier,
      shardId: c.shard?.ids[0] ?? 0,
    })),
  )) as GuildRow[][];
  return batches.flat();
}

async function buildGuildDirectory(
  redis: Redis,
  rows: GuildRow[],
  source: 'live' | 'cache',
): Promise<GuildDirectoryResponse> {
  const maxGuilds = getMaxGuilds();
  const [traffic24h, trafficHour] = await Promise.all([
    aggregateGuildCommandCounts24h(redis),
    aggregateGuildCommandCountsCurrentHour(redis),
  ]);

  const guilds: LiveGuildEntry[] = rows
    .map((g) => ({
      ...g,
      commands24h: traffic24h.get(g.id) ?? 0,
      commandsHour: trafficHour.get(g.id) ?? 0,
    }))
    .sort((a, b) => b.memberCount - a.memberCount);

  const total = guilds.length;
  return {
    collectedAt: new Date().toISOString(),
    total,
    maxGuilds,
    atCap: total >= maxGuilds,
    source,
    guilds,
  };
}

export async function persistGuildDirectoryCache(
  redis: Redis,
  directory: GuildDirectoryResponse,
): Promise<void> {
  await redis
    .set(OPS_GUILD_DIRECTORY_KEY, JSON.stringify(directory), 'EX', OPS_GUILD_DIRECTORY_TTL_SEC)
    .catch(() => null);
}

export async function getCachedGuildDirectory(redis: Redis): Promise<GuildDirectoryResponse | null> {
  try {
    const raw = await redis.get(OPS_GUILD_DIRECTORY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GuildDirectoryResponse;
    return { ...parsed, source: 'cache' };
  } catch {
    return null;
  }
}

/** Shard 0 publishes live guild list for standalone ops panel. */
export async function publishGuildDirectoryFromClient(
  client: Client,
  redis: Redis,
): Promise<GuildDirectoryResponse> {
  const rows = await fetchGuildRowsFromClient(client);
  const directory = await buildGuildDirectory(redis, rows, 'live');
  await persistGuildDirectoryCache(redis, directory);
  return directory;
}

/** Per-guild command counts from rolling hour keys (last 24 UTC hours). */
export async function aggregateGuildCommandCounts24h(
  redis: Redis,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getTime() - i * 3600_000);
    const suffix = hourBucketKey(d).replace('ops:cmd:hour:', '');
    const pattern = `ops:guild:hour:${suffix}:*`;
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
      cursor = next;
      for (const key of keys) {
        const guildId = key.split(':').pop();
        if (!guildId) continue;
        const raw = await redis.get(key);
        const n = parseInt(raw ?? '0', 10);
        if (!Number.isFinite(n)) continue;
        counts.set(guildId, (counts.get(guildId) ?? 0) + n);
      }
    } while (cursor !== '0');
  }
  return counts;
}

export async function aggregateGuildCommandCountsCurrentHour(
  redis: Redis,
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  const suffix = hourBucketKey().replace('ops:cmd:hour:', '');
  const pattern = `ops:guild:hour:${suffix}:*`;
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
    cursor = next;
    for (const key of keys) {
      const guildId = key.split(':').pop();
      if (!guildId) continue;
      const raw = await redis.get(key);
      const n = parseInt(raw ?? '0', 10);
      if (Number.isFinite(n) && n > 0) counts.set(guildId, n);
    }
  } while (cursor !== '0');
  return counts;
}

export async function fetchLiveGuildDirectory(
  manager: ShardingManager,
  redis: Redis,
): Promise<GuildDirectoryResponse> {
  const rows = await fetchGuildRowsFromManager(manager);
  return buildGuildDirectory(redis, rows, 'live');
}

/** Panel API: live Discord data when manager ready, else Redis cache from shard 0. */
export async function resolveGuildDirectory(
  redis: Redis,
  manager: ShardingManager | null,
): Promise<GuildDirectoryResponse> {
  const managerReady =
    manager != null &&
    manager.shards.size > 0 &&
    [...manager.shards.values()].some((s) => s.ready);

  if (managerReady) {
    try {
      return await fetchLiveGuildDirectory(manager, redis);
    } catch {
      /* fall through to cache */
    }
  }

  const cached = await getCachedGuildDirectory(redis);
  if (cached) {
    const [traffic24h, trafficHour] = await Promise.all([
      aggregateGuildCommandCounts24h(redis),
      aggregateGuildCommandCountsCurrentHour(redis),
    ]);
    const guilds = cached.guilds.map((g) => ({
      ...g,
      commands24h: traffic24h.get(g.id) ?? g.commands24h,
      commandsHour: trafficHour.get(g.id) ?? g.commandsHour,
    }));
    return { ...cached, guilds, collectedAt: cached.collectedAt };
  }

  const maxGuilds = getMaxGuilds();
  return {
    collectedAt: new Date().toISOString(),
    total: 0,
    maxGuilds,
    atCap: false,
    source: 'cache',
    guilds: [],
  };
}
