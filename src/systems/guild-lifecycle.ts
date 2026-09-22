/**
 * guild-lifecycle.ts — Guild cap enforcement + structured audit logs.
 */
import type { Client, Guild } from 'discord.js';
import { getMaxGuilds } from '../utils/launch-config';
import { getAdminIds } from '../utils/admin-access';

export type GuildAuditAction = 'accepted' | 'rejected' | 'pruned' | 'left';

export interface GuildAuditPayload {
  event: 'guild.join' | 'guild.join.rejected' | 'guild.leave' | 'guild.cap.prune';
  guildId: string;
  guildName: string;
  memberCount: number;
  ownerId: string;
  totalGuilds: number;
  maxGuilds: number;
  shardId: string;
  action: GuildAuditAction;
}

export function logGuildAudit(payload: GuildAuditPayload): void {
  const line = JSON.stringify({
    ...payload,
    ts: new Date().toISOString(),
  });
  console.info(`[GuildAudit] ${line}`);
}

export function getShardIdLabel(): string {
  return process.env.SHARD_ID ?? 'none';
}

/** Total guild count across all shards when sharded. */
export async function getTotalGuildCount(client: Client): Promise<number> {
  if (!client.shard) {
    return client.guilds.cache.size;
  }
  const counts = await client.shard.fetchClientValues('guilds.cache.size') as number[];
  return counts.reduce((sum, n) => sum + n, 0);
}

export interface GuildSnapshot {
  id: string;
  name: string;
  memberCount: number;
  ownerId: string;
  joinedAt: number;
}

/** Collect guild snapshots from all shards (for startup prune on shard 0). */
export async function fetchAllGuildSnapshots(client: Client): Promise<GuildSnapshot[]> {
  if (!client.shard) {
    return [...client.guilds.cache.values()].map(guildToSnapshot);
  }
  const results = await client.shard.broadcastEval((c) =>
    [...c.guilds.cache.values()].map((g) => ({
      id: g.id,
      name: g.name,
      memberCount: g.memberCount,
      ownerId: g.ownerId,
      joinedAt: g.joinedAt?.getTime() ?? 0,
    })),
  ) as GuildSnapshot[][];
  const merged: GuildSnapshot[] = [];
  for (const batch of results) {
    merged.push(...batch);
  }
  return merged;
}

function guildToSnapshot(guild: Guild): GuildSnapshot {
  return {
    id: guild.id,
    name: guild.name,
    memberCount: guild.memberCount,
    ownerId: guild.ownerId,
    joinedAt: guild.joinedAt?.getTime() ?? 0,
  };
}

export function buildAuditFromGuild(
  guild: Guild,
  totalGuilds: number,
  event: GuildAuditPayload['event'],
  action: GuildAuditAction,
): GuildAuditPayload {
  return {
    event,
    guildId: guild.id,
    guildName: guild.name,
    memberCount: guild.memberCount,
    ownerId: guild.ownerId,
    totalGuilds,
    maxGuilds: getMaxGuilds(),
    shardId: getShardIdLabel(),
    action,
  };
}

export async function notifyOwnerCapRejected(
  client: Client,
  guild: Guild,
  totalGuilds: number,
): Promise<void> {
  const ownerId = [...getAdminIds()][0];
  if (!ownerId) return;
  try {
    const user = await client.users.fetch(ownerId);
    await user.send(
      `⚠️ **Guild cap reached** (${totalGuilds}/${getMaxGuilds()})\n` +
        `Left server: **${guild.name}** (\`${guild.id}\`, ${guild.memberCount} members).`,
    );
  } catch {
    // DM closed or fetch failed
  }
}

/**
 * Leave guild if over cap (called right after join). Returns true if left.
 */
export async function enforceGuildCapOnJoin(client: Client, guild: Guild): Promise<boolean> {
  const maxGuilds = getMaxGuilds();
  const totalGuilds = await getTotalGuildCount(client);

  if (totalGuilds <= maxGuilds) {
    logGuildAudit(buildAuditFromGuild(guild, totalGuilds, 'guild.join', 'accepted'));
    return false;
  }

  logGuildAudit(buildAuditFromGuild(guild, totalGuilds, 'guild.join.rejected', 'rejected'));
  await notifyOwnerCapRejected(client, guild, totalGuilds);
  await guild.leave().catch((err) => {
    console.error(`[Guild] leave failed ${guild.id}:`, err instanceof Error ? err.message : err);
  });
  return true;
}

/**
 * Shard 0 startup: leave newest guilds until at cap.
 */
export async function pruneExcessGuildsOnReady(client: Client): Promise<number> {
  const maxGuilds = getMaxGuilds();
  const snapshots = await fetchAllGuildSnapshots(client);
  if (snapshots.length <= maxGuilds) return 0;

  const sorted = [...snapshots].sort((a, b) => b.joinedAt - a.joinedAt);
  const toPrune = sorted.slice(0, snapshots.length - maxGuilds);
  let pruned = 0;

  for (const snap of toPrune) {
    const guild = client.guilds.cache.get(snap.id);
    if (!guild) continue;
    const totalGuilds = await getTotalGuildCount(client);
    logGuildAudit({
      event: 'guild.cap.prune',
      guildId: snap.id,
      guildName: snap.name,
      memberCount: snap.memberCount,
      ownerId: snap.ownerId,
      totalGuilds,
      maxGuilds,
      shardId: getShardIdLabel(),
      action: 'pruned',
    });
    await guild.leave().catch(() => null);
    pruned++;
  }

  if (pruned > 0) {
    console.warn(`[Guild] Startup prune: left ${pruned} guild(s) over MAX_GUILDS=${maxGuilds}`);
  }
  return pruned;
}

export function logGuildLeave(guild: Guild, totalGuilds: number): void {
  logGuildAudit({
    event: 'guild.leave',
    guildId: guild.id,
    guildName: guild.name,
    memberCount: guild.memberCount,
    ownerId: guild.ownerId,
    totalGuilds,
    maxGuilds: getMaxGuilds(),
    shardId: getShardIdLabel(),
    action: 'left',
  });
}

export function registerGuildLifecycleHandlers(client: Client): void {
  client.on('guildCreate', (guild) => {
    void enforceGuildCapOnJoin(client, guild);
  });

  client.on('guildDelete', (guild) => {
    void getTotalGuildCount(client).then((total) => logGuildLeave(guild, total));
  });
}
