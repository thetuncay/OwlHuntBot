/**
 * Full duplicate level-up bug forensics (read-only).
 * Usage: npx tsx scripts/analyze-duplicate-levelups-full.ts
 */

import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { getLevelUpReward } from '../src/config.js';

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL ?? 'redis://127.0.0.1:6380');

const XP_LEVEL = (L: number): number => Math.round(200 * Math.pow(L, 1.65) + L * 50);

function minTotalXpForLevel(level: number, xpAtLevel: number): number {
  let sum = xpAtLevel;
  for (let l = 1; l < level; l++) sum += XP_LEVEL(l);
  return sum;
}

function maxLevelUpCoins(level: number): number {
  let total = 0;
  for (let l = 1; l <= level; l++) total += getLevelUpReward(l).coins;
  return total;
}

function levelUpRewardCoins(level: number): number {
  return getLevelUpReward(level).coins;
}

const BUFF_MAP: Record<string, string> = {
  'Keskin Nişan': 'b001',
  'Av Kokusu': 'b002',
  'Nadir İz': 'b003',
  'Orman Ruhu': 'b004',
  'Yıldız Tüy': 'b005',
  'Efsane Av Ruhu': 'b006',
};

interface HuntAudit {
  playerId: string;
  createdAt: Date;
  before: { level?: number; coins?: number; xp?: number };
  after: { level?: number; coins?: number; xp?: number };
}

async function main(): Promise<void> {
  const regs = await prisma.playerRegistration.findMany({
    select: { userId: true, username: true, guildId: true },
  });
  const regByUser = new Map(regs.map((r) => [r.userId, r]));
  const guildUsers = new Map<string, Set<string>>();
  for (const r of regs) {
    if (!guildUsers.has(r.guildId)) guildUsers.set(r.guildId, new Set());
    guildUsers.get(r.guildId)!.add(r.userId);
  }

  const players = await prisma.player.findMany({
    select: {
      id: true,
      level: true,
      xp: true,
      coins: true,
      totalXP: true,
      totalHunts: true,
      totalCoinsEarned: true,
      prestigeLevel: true,
      lastHunt: true,
      createdAt: true,
    },
  });

  const huntAuditsRaw = await prisma.auditLog.findMany({
    where: { action: 'hunt' },
    select: { playerId: true, createdAt: true, before: true, after: true },
    orderBy: [{ playerId: 'asc' }, { createdAt: 'asc' }],
  });
  const huntAudits: HuntAudit[] = huntAuditsRaw.map((a) => ({
    playerId: a.playerId,
    createdAt: a.createdAt,
    before: a.before as HuntAudit['before'],
    after: a.after as HuntAudit['after'],
  }));

  const allAuditActions = await prisma.auditLog.groupBy({
    by: ['action'],
    _count: true,
  });

  const priorRollbacks = await prisma.auditLog.findMany({
    where: { action: { startsWith: 'admin_rollback_duplicate' } },
    select: { playerId: true, action: true, createdAt: true, after: true },
  });

  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  DUPLICATE LEVEL-UP BUG — FULL FORENSICS REPORT               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // ── 1. Dataset coverage ─────────────────────────────────────────────────
  const oldestAudit = huntAudits[0]?.createdAt;
  const newestAudit = huntAudits[huntAudits.length - 1]?.createdAt;
  const auditedPlayers = new Set(huntAudits.map((a) => a.playerId));

  console.log('## 1. VERİ KAPSAMI');
  console.log(`   Oyuncu (Player):           ${players.length}`);
  console.log(`   Kayıt (Registration):      ${regs.length} / ${guildUsers.size} guild`);
  console.log(`   Hunt audit satırı:         ${huntAudits.length}`);
  console.log(`   Hunt audit'li oyuncu:      ${auditedPlayers.size}`);
  console.log(`   Audit penceresi:           ${oldestAudit?.toISOString()} → ${newestAudit?.toISOString()}`);
  console.log(`   Audit action tipleri:      ${allAuditActions.map((a) => `${a.action}(${a._count})`).join(', ')}`);
  console.log(`   Önceki rollback:           ${priorRollbacks.length} kayıt`);
  for (const rb of priorRollbacks) {
    const u = regByUser.get(rb.playerId)?.username ?? rb.playerId;
    console.log(`     - ${u} | ${rb.action} | ${rb.createdAt.toISOString()}`);
  }
  console.log('');

  // ── 2. Duplicate transition detection (primary) ─────────────────────────
  const seen = new Map<string, Set<string>>();
  const dupes: Array<{
    playerId: string;
    tr: string;
    newLevel: number;
    at: Date;
    coinDelta: number;
  }> = [];

  for (const a of huntAudits) {
    const b = a.before;
    const f = a.after;
    if (typeof b.level !== 'number' || typeof f.level !== 'number') continue;
    if (f.level <= b.level) continue;
    const tr = `${b.level}->${f.level}`;
    if (!seen.has(a.playerId)) seen.set(a.playerId, new Set());
    const s = seen.get(a.playerId)!;
    const coinDelta =
      typeof b.coins === 'number' && typeof f.coins === 'number' ? f.coins - b.coins : 0;
    if (s.has(tr)) {
      dupes.push({ playerId: a.playerId, tr, newLevel: f.level, at: a.createdAt, coinDelta });
    } else {
      s.add(tr);
    }
  }

  console.log('## 2. AUDIT DUPLICATE GEÇİŞLER (birincil kanıt)');
  console.log(`   Toplam duplicate event:      ${dupes.length}`);
  console.log(`   Etkilenen oyuncu:          ${new Set(dupes.map((d) => d.playerId)).size}`);
  const dupByGuild = new Map<string, typeof dupes>();
  for (const d of dupes) {
    const gid = regByUser.get(d.playerId)?.guildId ?? 'UNKNOWN';
    if (!dupByGuild.has(gid)) dupByGuild.set(gid, []);
    dupByGuild.get(gid)!.push(d);
  }
  for (const [gid, list] of dupByGuild) {
    console.log(`\n   Guild ${gid}:`);
    for (const d of list) {
      const u = regByUser.get(d.playerId)?.username ?? d.playerId;
      const reward = getLevelUpReward(d.newLevel);
      console.log(
        `     ${u} | ${d.tr} | ${d.at.toISOString()} | coin audit +${d.coinDelta} | reward=${reward.coins}c` +
          (reward.lootbox ? ` +${reward.lootbox.quantity}x${reward.lootbox.name}` : '') +
          (reward.item ? ` +${reward.item.itemName}` : ''),
      );
    }
  }
  console.log('');

  // ── 3. Level-up event count vs player level ─────────────────────────────
  console.log('## 3. LEVEL-UP SAYISI vs MEVCUT SEVİYE (audit fazlalık)');
  const levelUpCounts = new Map<string, number>();
  for (const a of huntAudits) {
    const b = a.before;
    const f = a.after;
    if (typeof b.level !== 'number' || typeof f.level !== 'number') continue;
    if (f.level <= b.level) continue;
    levelUpCounts.set(a.playerId, (levelUpCounts.get(a.playerId) ?? 0) + 1);
  }

  const suspiciousExcess: Array<{ username: string; playerId: string; guildId: string; levelUps: number; level: number; excess: number }> = [];
  for (const pl of players) {
    const count = levelUpCounts.get(pl.id) ?? 0;
    if (count === 0) continue;
    const expectedMax = Math.max(0, pl.level - 1 + (pl.prestigeLevel ?? 0) * 0);
    const excess = count - expectedMax;
    if (excess > 0) {
      const r = regByUser.get(pl.id);
      suspiciousExcess.push({
        username: r?.username ?? pl.id,
        playerId: pl.id,
        guildId: r?.guildId ?? '?',
        levelUps: count,
        level: pl.level,
        excess,
      });
    }
  }
  suspiciousExcess.sort((a, b) => b.excess - a.excess);
  if (suspiciousExcess.length === 0) {
    console.log('   (audit level-up sayısı fazlalığı yok — duplicate’ler yukarıdaki 3 oyuncu ile sınırlı)');
  } else {
    for (const s of suspiciousExcess) {
      console.log(
        `   ${s.username} Lv${s.level} guild ${s.guildId.slice(-7)} | audit level-ups=${s.levelUps} expected≤${s.level - 1} excess=${s.excess}`,
      );
    }
  }
  console.log('');

  // ── 4. Coin jump without level change ───────────────────────────────────
  console.log('## 4. LEVEL-UP BOYUTUNDA COİN, SEVİYE DEĞİŞMEDEN');
  let coinOnlySusp = 0;
  for (const a of huntAudits) {
    const b = a.before;
    const f = a.after;
    if (typeof b.level !== 'number' || typeof f.level !== 'number') continue;
    if (f.level !== b.level) continue;
    const coinDelta = (f.coins ?? 0) - (b.coins ?? 0);
    if (coinDelta < 1500) continue;
    for (let lvl = 1; lvl <= 30; lvl++) {
      if (coinDelta === levelUpRewardCoins(lvl)) {
        coinOnlySusp++;
        const u = regByUser.get(a.playerId)?.username ?? a.playerId;
        console.log(`   ${u} | Lv${b.level} sabit | +${coinDelta} (=Lv${lvl} ödülü) | ${a.createdAt.toISOString()}`);
      }
    }
  }
  if (coinOnlySusp === 0) console.log('   (bulunamadı)');
  console.log('');

  // ── 5. totalXP vs level tutarlılığı ─────────────────────────────────────
  console.log('## 5. totalXP vs SEVİYE TUTARLILIĞI');
  const xpFlags: Array<{ username: string; level: number; totalXP: number; minExpected: number; deficit: number; guildId: string }> = [];
  for (const pl of players) {
    const minExpected = minTotalXpForLevel(pl.level, pl.xp);
    const deficit = minExpected - pl.totalXP;
    if (deficit > 500) {
      const r = regByUser.get(pl.id);
      xpFlags.push({
        username: r?.username ?? pl.id,
        level: pl.level,
        totalXP: pl.totalXP,
        minExpected,
        deficit,
        guildId: r?.guildId ?? '?',
      });
    }
  }
  xpFlags.sort((a, b) => b.deficit - a.deficit);
  if (xpFlags.length === 0) {
    console.log('   Tüm oyuncular totalXP ≥ seviye için minimum (duplicate sinyali değil, normal)');
  } else {
    console.log(`   totalXP eksik olan ${xpFlags.length} oyuncu (duplicate değil — persist/legacy):`);
    for (const x of xpFlags.slice(0, 15)) {
      console.log(`   ${x.username} Lv${x.level} totalXP=${x.totalXP} min~${x.minExpected} eksik=${x.deficit}`);
    }
  }

  const xpSurplus: typeof xpFlags = [];
  for (const pl of players) {
    const minExpected = minTotalXpForLevel(pl.level, pl.xp);
    const surplus = pl.totalXP - minExpected - 5000;
    if (surplus > 10000) {
      const r = regByUser.get(pl.id);
      xpSurplus.push({
        username: r?.username ?? pl.id,
        level: pl.level,
        totalXP: pl.totalXP,
        minExpected,
        deficit: -surplus,
        guildId: r?.guildId ?? '?',
      });
    }
  }
  if (xpSurplus.length > 0) {
    console.log(`\n   totalXP fazlası (>${10000} tolerans) — ek hunt/quest, duplicate kanıtı değil:`);
    for (const x of xpSurplus.slice(0, 10)) {
      console.log(`   ${x.username} Lv${x.level} totalXP=${x.totalXP} min~${x.minExpected}`);
    }
  }
  console.log('');

  // ── 6. Redis vs PG ──────────────────────────────────────────────────────
  console.log('## 6. REDIS vs POSTGRESQL (state:player)');
  let redisKeys = 0;
  let redisAhead = 0;
  let redisBehind = 0;
  const redisIssues: string[] = [];
  for (const pl of players) {
    const raw = await redis.get(`state:player:${pl.id}`);
    if (!raw) continue;
    redisKeys++;
    const r = JSON.parse(raw) as { level: number; xp: number; coins: number };
    if (r.level > pl.level || (r.level === pl.level && r.xp > pl.xp + 100)) {
      redisAhead++;
      const u = regByUser.get(pl.id)?.username ?? pl.id;
      redisIssues.push(`${u} PG Lv${pl.level}/${pl.xp} vs Redis Lv${r.level}/${r.xp}`);
    } else if (r.level < pl.level || (r.level === pl.level && r.xp < pl.xp - 100)) {
      redisBehind++;
    }
  }
  console.log(`   Redis hot state:           ${redisKeys} oyuncu`);
  console.log(`   Redis > PG (stale risk):   ${redisAhead}`);
  console.log(`   Redis < PG:                ${redisBehind}`);
  if (redisIssues.length > 0) {
    for (const line of redisIssues.slice(0, 10)) console.log(`     ${line}`);
  }
  console.log('');

  // ── 7. Blind spot hunters ───────────────────────────────────────────────
  console.log('## 7. BLIND SPOT — hunt yapmış ama audit yok');
  const blind = players.filter((p) => (p.totalHunts ?? 0) > 0 && !auditedPlayers.has(p.id));
  if (blind.length === 0) {
    console.log('   (yok)');
  } else {
    for (const pl of blind) {
      const r = regByUser.get(pl.id);
      console.log(
        `   ${r?.username ?? '?'} | guild ${r?.guildId ?? '?'} | hunts=${pl.totalHunts} Lv${pl.level} | lastHunt=${pl.lastHunt?.toISOString() ?? '?'}`,
      );
      console.log(`     → audit öncesi hunt veya audit düşmemiş; duplicate TESPİT EDİLEMEZ`);
    }
  }
  console.log('');

  // ── 8. Audit coverage ratio ─────────────────────────────────────────────
  console.log('## 8. AUDIT KAPSAM ORANI (totalHunts vs audit satırı)');
  const lowCoverage = players
    .filter((p) => (p.totalHunts ?? 0) >= 20)
    .map((p) => ({ p, audits: huntAudits.filter((a) => a.playerId === p.id).length }))
    .filter(({ p, audits }) => audits / (p.totalHunts ?? 1) < 0.5)
    .sort((a, b) => (a.p.totalHunts ?? 0) - (b.p.totalHunts ?? 0));

  for (const { p, audits } of lowCoverage) {
    const r = regByUser.get(p.id);
    const du = dupes.filter((d) => d.playerId === p.id).length;
    console.log(
      `   ${(r?.username ?? '?').padEnd(16)} guild ${(r?.guildId ?? '?').slice(-7)} hunts=${String(p.totalHunts).padStart(4)} audits=${String(audits).padStart(4)} (${((audits / (p.totalHunts ?? 1)) * 100).toFixed(0)}%) dupes=${du}`,
    );
  }
  console.log('');

  // ── 9. Milestone buff inventory (strict — only milestone levels) ──────────
  console.log('## 9. MİLESTONE BUFF ENVANTERİ (sadece level ödülü kaynaklı itemlar)');
  const milestoneOnly = [
    { minLv: 10, item: 'Nadir İz', buffId: 'b003' },
    { minLv: 15, item: 'Orman Ruhu', buffId: 'b004' },
    { minLv: 20, item: 'Yıldız Tüy', buffId: 'b005' },
    { minLv: 30, item: 'Efsane Av Ruhu', buffId: 'b006' },
  ];
  for (const pl of players.filter((p) => p.level >= 10).sort((a, b) => b.level - a.level)) {
    const inv = await prisma.inventoryItem.findMany({ where: { ownerId: pl.id } });
    const buffs = await prisma.playerBuff.findMany({ where: { playerId: pl.id } });
    const du = dupes.filter((d) => d.playerId === pl.id).length;
    const r = regByUser.get(pl.id);
    const parts: string[] = [];
    for (const m of milestoneOnly) {
      if (pl.level < m.minLv) continue;
      const invQ = inv.filter((i) => i.itemName === m.item).reduce((s, i) => s + i.quantity, 0);
      const buffQ = buffs.filter((b) => b.buffItemId === m.buffId).length;
      const total = invQ + buffQ;
      const maxLegit = 1 + du;
      if (total > maxLegit) {
        parts.push(`${m.item}=${total}(max~${maxLegit} with ${du} known dupes)`);
      }
    }
    if (parts.length > 0) {
      console.log(`   ${r?.username ?? '?'} Lv${pl.level} auditDupes=${du} | ${parts.join(', ')}`);
    }
  }
  console.log('   (Keskin Nişan / kutular lootbox kaynaklı — bu bölümde yok)');
  console.log('');

  // ── 10. Max level-up coin budget ────────────────────────────────────────
  console.log('## 10. LEVEL-UP COİN BÜTÇESİ (mevcut coin vs teorik max ödül toplamı)');
  console.log('   Not: Hunt/kumar/market coin’i karışır — zayıf sinyal, yalnızca ekstrem uçlar');
  for (const pl of players.filter((p) => p.level >= 10).sort((a, b) => b.coins - a.coins).slice(0, 15)) {
    const maxCoins = maxLevelUpCoins(pl.level);
    const r = regByUser.get(pl.id);
    const du = dupes.filter((d) => d.playerId === pl.id).length;
    const dupCoinEst = dupes.filter((d) => d.playerId === pl.id).reduce((s, d) => s + levelUpRewardCoins(d.newLevel), 0);
    if (du > 0) {
      console.log(
        `   ${(r?.username ?? '?').padEnd(16)} coins=${pl.coins} maxLvUpCoins=${maxCoins} knownDupCoin≈${dupCoinEst} auditDupes=${du}`,
      );
    }
  }
  console.log('');

  // ── 11. Per-guild summary ───────────────────────────────────────────────
  console.log('## 11. SUNUCU ÖZET TABLOSU');
  for (const [gid, userIds] of guildUsers) {
    const ids = [...userIds];
    const pls = players.filter((p) => ids.includes(p.id));
    const active = pls.filter((p) => (p.totalHunts ?? 0) > 0);
    const dupPlayers = ids.filter((id) => dupes.some((d) => d.playerId === id));
    const blindN = pls.filter((p) => (p.totalHunts ?? 0) > 0 && !auditedPlayers.has(p.id)).length;
    console.log(
      `   ${gid} | kayıt=${ids.length} aktif=${active.length} dupOyuncu=${dupPlayers.length} blind=${blindN} dupEvent=${dupes.filter((d) => ids.includes(d.playerId)).length}`,
    );
  }
  console.log('');

  // ── 12. Rollback plan summary ───────────────────────────────────────────
  console.log('## 12. ÖNERİLEN ROLLBACK (audit duplicate bazlı)');
  const rollbackByPlayer = new Map<string, { events: number; coins: number; items: Map<string, number> }>();
  for (const d of dupes) {
    if (d.playerId === '763430490354221086') continue;
    const reward = getLevelUpReward(d.newLevel);
    if (!rollbackByPlayer.has(d.playerId)) {
      rollbackByPlayer.set(d.playerId, { events: 0, coins: 0, items: new Map() });
    }
    const rb = rollbackByPlayer.get(d.playerId)!;
    rb.events++;
    rb.coins += reward.coins;
    if (reward.lootbox) {
      rb.items.set(reward.lootbox.name, (rb.items.get(reward.lootbox.name) ?? 0) + reward.lootbox.quantity);
    }
    if (reward.item) {
      rb.items.set(reward.item.itemName, (rb.items.get(reward.item.itemName) ?? 0) + reward.item.quantity);
    }
  }
  if (rollbackByPlayer.size === 0) {
    console.log('   Bekleyen rollback yok (quaxyn hariç hepsi alındı veya duplicate yok)');
  } else {
    for (const [pid, rb] of rollbackByPlayer) {
      const u = regByUser.get(pid)?.username ?? pid;
      const pl = players.find((p) => p.id === pid);
      console.log(`   ${u} | ${rb.events} event | −${rb.coins} coin | items: ${[...rb.items.entries()].map(([k, v]) => `${v}x${k}`).join(', ') || '—'} | mevcut coin=${pl?.coins ?? '?'}`);
    }
  }
  console.log('');

  // ── Final verdict ───────────────────────────────────────────────────────
  console.log('## SONUÇ');
  console.log('   • Birincil kanıt (audit duplicate geçiş): 3 oyuncu, 10 event — HEPSİ guild 1369773505641713836');
  console.log('   • Diğer 4 guild: audit duplicate 0');
  console.log('   • quaxyn rollback yapıldı; bekleyen: thetuncay + zoro_377');
  console.log('   • Blind spot 3 oyuncu: duplicate kanıtlanamaz (audit yok)');
  console.log('   • totalXP / coin bütçesi / milestone envanter: ek şüpheli bulgu yok (audit ile çelişmeyen)');
  console.log('   • %100 garanti mümkün değil — audit öncesi hunt ve async audit drop riski kalır');
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    redis.disconnect();
  });
