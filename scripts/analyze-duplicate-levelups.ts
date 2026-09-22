/**
 * Cross-guild duplicate level-up bug analysis (read-only).
 * Usage: npx tsx scripts/analyze-duplicate-levelups.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const BUFF_MAP: Record<string, string> = {
  'Keskin Nişan': 'b001',
  'Nadir İz': 'b003',
  'Orman Ruhu': 'b004',
  'Yıldız Tüy': 'b005',
};

async function main(): Promise<void> {
  const regs = await prisma.playerRegistration.findMany({
    select: { userId: true, username: true, guildId: true },
  });
  const guildUsers = new Map<string, Set<string>>();
  for (const r of regs) {
    if (!guildUsers.has(r.guildId)) guildUsers.set(r.guildId, new Set());
    guildUsers.get(r.guildId)!.add(r.userId);
  }
  const regByUser = new Map(regs.map((r) => [r.userId, r]));

  const audits = await prisma.auditLog.findMany({
    where: { action: 'hunt' },
    select: { playerId: true, createdAt: true, before: true, after: true },
    orderBy: [{ playerId: 'asc' }, { createdAt: 'asc' }],
  });

  const seen = new Map<string, Set<string>>();
  const dupes: Array<{ playerId: string; tr: string; at: Date; coinDelta: number }> = [];
  for (const a of audits) {
    const b = a.before as { level?: number; coins?: number } | null;
    const f = a.after as { level?: number; coins?: number } | null;
    if (!b || !f || typeof b.level !== 'number' || typeof f.level !== 'number') continue;
    if (f.level <= b.level) continue;
    const tr = `${b.level}->${f.level}`;
    if (!seen.has(a.playerId)) seen.set(a.playerId, new Set());
    const s = seen.get(a.playerId)!;
    const coinDelta =
      typeof b.coins === 'number' && typeof f.coins === 'number' ? f.coins - b.coins : 0;
    if (s.has(tr)) dupes.push({ playerId: a.playerId, tr, at: a.createdAt, coinDelta });
    else s.add(tr);
  }

  console.log('=== DUPLICATE HUNT LEVEL-UPS BY GUILD ===');
  const byGuild = new Map<string, typeof dupes>();
  for (const d of dupes) {
    const gid = regByUser.get(d.playerId)?.guildId ?? 'NO_REGISTRATION';
    if (!byGuild.has(gid)) byGuild.set(gid, []);
    byGuild.get(gid)!.push(d);
  }
  for (const [gid, list] of byGuild) {
    console.log(`Guild ${gid}: ${list.length} events, ${new Set(list.map((x) => x.playerId)).size} players`);
    for (const x of list) {
      const u = regByUser.get(x.playerId)?.username ?? '?';
      console.log(`  ${u} | ${x.tr} | ${x.at.toISOString()} | coin+${x.coinDelta}`);
    }
  }

  const players = await prisma.player.findMany({
    select: { id: true, level: true, coins: true, totalHunts: true, lastHunt: true },
  });
  const auditedPlayers = new Set(audits.map((a) => a.playerId));

  console.log('\n=== PER-GUILD PLAYER MATRIX ===');
  for (const [gid, userIds] of guildUsers) {
    const pls = players.filter((x) => userIds.has(x.id));
    console.log(`\nGuild ${gid} (${userIds.size} registered)`);
    for (const pl of pls.sort((a, b) => (b.totalHunts ?? 0) - (a.totalHunts ?? 0))) {
      const r = regByUser.get(pl.id);
      const du = dupes.filter((d) => d.playerId === pl.id).length;
      console.log(
        `  ${(r?.username ?? '?').padEnd(16)} Lv${String(pl.level).padStart(2)} hunts ${String(pl.totalHunts ?? 0).padStart(5)} audit ${auditedPlayers.has(pl.id) ? 'Y' : 'N'} dupes ${du}`,
      );
    }
  }

  console.log('\n=== BLIND SPOT: totalHunts>0 but no hunt audit ===');
  const blind = players.filter((x) => (x.totalHunts ?? 0) > 0 && !auditedPlayers.has(x.id));
  if (blind.length === 0) console.log('  (none)');
  for (const pl of blind) {
    const r = regs.find((x) => x.userId === pl.id);
    console.log(
      `  ${r?.username ?? '?'} | ${pl.id} | guild ${r?.guildId ?? '?'} | hunts ${pl.totalHunts} | Lv${pl.level}`,
    );
  }

  console.log('\n=== RAPID SAME TRANSITION (<30 min apart) ===');
  const byPlayer = new Map<string, typeof audits>();
  for (const a of audits) {
    if (!byPlayer.has(a.playerId)) byPlayer.set(a.playerId, []);
    byPlayer.get(a.playerId)!.push(a);
  }
  let rapidCount = 0;
  for (const [pid, list] of byPlayer) {
    const levelUps = list.filter((a) => {
      const b = a.before as { level?: number };
      const f = a.after as { level?: number };
      return b && f && (f.level ?? 0) > (b.level ?? 0);
    });
    for (let i = 0; i < levelUps.length; i++) {
      for (let j = i + 1; j < levelUps.length; j++) {
        const a = levelUps[i]!;
        const b = levelUps[j]!;
        const ba = a.before as { level: number };
        const fa = a.after as { level: number };
        const bb = b.before as { level: number };
        const fb = b.after as { level: number };
        const tr1 = `${ba.level}->${fa.level}`;
        const tr2 = `${bb.level}->${fb.level}`;
        if (tr1 !== tr2) continue;
        const gap = Math.abs(b.createdAt.getTime() - a.createdAt.getTime()) / 60000;
        if (gap <= 30) {
          rapidCount++;
          const u = regByUser.get(pid)?.username ?? pid;
          console.log(`  ${u} | ${tr1} | ${gap.toFixed(1)} min apart`);
        }
      }
    }
  }
  if (rapidCount === 0) console.log('  (none beyond audit duplicates)');

  console.log('\n=== MILESTONE ITEM SURPLUS (inv+buff > cap; cap=1 legit +1 slack) ===');
  const checks = [
    { minLv: 5, item: 'Keskin Nişan', cap: 2 },
    { minLv: 10, item: 'Nadir İz', cap: 2 },
    { minLv: 15, item: 'Orman Ruhu', cap: 2 },
    { minLv: 20, item: 'Yıldız Tüy', cap: 2 },
  ];
  for (const pl of players.filter((x) => x.level >= 5).sort((a, b) => b.level - a.level)) {
    const inv = await prisma.inventoryItem.findMany({ where: { ownerId: pl.id } });
    const buffs = await prisma.playerBuff.findMany({ where: { playerId: pl.id } });
    const flags: string[] = [];
    for (const c of checks) {
      if (pl.level < c.minLv) continue;
      const invQ = inv.filter((i) => i.itemName === c.item).reduce((s, i) => s + i.quantity, 0);
      const buffQ = buffs.filter((b) => b.buffItemId === BUFF_MAP[c.item]).length;
      const total = invQ + buffQ;
      if (total > c.cap) flags.push(`${c.item}=${total}(cap~${c.cap})`);
    }
    if (flags.length > 0) {
      const r = regByUser.get(pl.id);
      const du = dupes.filter((d) => d.playerId === pl.id).length;
      console.log(
        `  ${r?.username ?? '?'} Lv${pl.level} guild ${r?.guildId ?? '?'} auditDupes=${du} | ${flags.join(', ')}`,
      );
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Total registrations: ${regs.length} across ${guildUsers.size} guilds`);
  console.log(`Total players in DB: ${players.length}`);
  console.log(`Players with hunt audit: ${auditedPlayers.size}`);
  console.log(`Duplicate hunt level-up events: ${dupes.length}`);
  console.log(`Affected players (audit): ${new Set(dupes.map((d) => d.playerId)).size}`);
  console.log(`Blind spot hunters (no audit): ${blind.length}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
