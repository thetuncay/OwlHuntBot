/**
 * OwO export JSON'larını analiz eder → owo-insights.json + src/data/*.json
 * Çalıştır: pnpm analyze:owo
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATALAR = join(ROOT, 'datalar');
const OUT_DATA = join(ROOT, 'src', 'data');

interface DatasetFile<T> {
  _metadata: { datasetType: string; recordCount: number; exportedAt: string };
  records: T[];
}

function loadLatest<T>(prefix: string): DatasetFile<T> {
  const file = readdirSync(DATALAR)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
    .sort()
    .pop();
  if (!file) throw new Error(`Missing ${prefix}*.json in datalar/`);
  return JSON.parse(readFileSync(join(DATALAR, file), 'utf8')) as DatasetFile<T>;
}

function inc(map: Map<string, number>, key: string, n = 1): void {
  map.set(key, (map.get(key) ?? 0) + n);
}

function topN(map: Map<string, number>, n: number): { key: string; count: number }[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => ({ key, count }));
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function normalizeOwOCommand(raw: string, prefix = 'w'): string | null {
  const t = raw.trim().toLowerCase();
  if (!t || t === 'owo') return null;
  let cmd = t;
  if (cmd.startsWith(prefix) && cmd.length > prefix.length) {
    cmd = cmd.slice(prefix.length);
  }
  if (!cmd) return null;
  return cmd.split(/\s+/)[0] ?? null;
}

function parseCowoncy(text: string): number | null {
  const daily = text.match(/daily[^0-9]*(\d[\d,]*)\s*cowoncy/i);
  if (daily) return parseInt(daily[1]!.replace(/,/g, ''), 10);
  const have = text.match(/have\s+\*?\*?__?([\d,]+)__?\s*cowoncy/i);
  if (have) return parseInt(have[1]!.replace(/,/g, ''), 10);
  const gained = text.match(/gained\s+\*?\*?([\d,]+)\*?\*?\s*cowoncy/i);
  if (gained) return parseInt(gained[1]!.replace(/,/g, ''), 10);
  return null;
}

function segmentHint(record: {
  player_type: string;
  most_used_command: string | null;
}): string | null {
  const cmd = record.most_used_command;
  if (cmd && ['cf', 'bj', 'slot', 'coinflip'].includes(cmd)) {
    return 'OwO alışkanlığın: Kumar aynı — `w cf`, `w bj`, `w slot`';
  }
  if (cmd && ['battle', 'h', 'sell', 'b', 's', 'hunt'].includes(cmd)) {
    return 'Av döngüsü: `w h` → encounter **Savaş** → `w sell` (OwO `h b s`)';
  }
  if (cmd === 'daily') {
    return 'OwO `daily` → OwlHunt **`w quests`** (günlük görev + ödül)';
  }
  if (record.player_type === 'passive_player') {
    return 'Günlük rutin: `w quests` tamamla, sonra av veya kumar';
  }
  if (cmd === 'cash') {
    return 'Bakiye: `w cash` · Liderboard: `w lb`';
  }
  return null;
}

// ─── Load datasets ────────────────────────────────────────────────────────────

type CmdRec = { raw_message: string; category: string; timestamp: string };
type PbRec = {
  user_id: string;
  guild_id: string;
  player_type: string;
  most_used_command: string | null;
  peak_hours_utc: string;
  total_commands: number;
};
type ReRec = {
  command: string;
  reward_type: string;
  reward_value: string;
  category: string;
};
type SpRec = { commands: string; user_id: string };

const cmdData = loadLatest<CmdRec>('command_classification');
const pbData = loadLatest<PbRec>('player_behavior');
const reData = loadLatest<ReRec>('reward_expectation');
const spData = loadLatest<SpRec>('sequence_prediction');

// ─── Command frequency ────────────────────────────────────────────────────────

const cmdFreq = new Map<string, number>();
const categoryFreq = new Map<string, number>();
const hourUtc = new Map<string, number>();

for (const r of cmdData.records) {
  inc(categoryFreq, r.category);
  const norm = normalizeOwOCommand(r.raw_message);
  if (norm) inc(cmdFreq, norm);
  const h = new Date(r.timestamp).getUTCHours();
  inc(hourUtc, String(h), 1);
}

// ─── Sequences ────────────────────────────────────────────────────────────────

const bigramFreq = new Map<string, number>();
const sequenceFreq = new Map<string, number>();

for (const r of spData.records) {
  let cmds: string[] = [];
  try {
    cmds = JSON.parse(r.commands) as string[];
  } catch {
    continue;
  }
  if (cmds.length >= 2) {
    sequenceFreq.set(cmds.join(' → '), (sequenceFreq.get(cmds.join(' → ')) ?? 0) + 1);
  }
  for (let i = 0; i < cmds.length - 1; i++) {
    const bg = `${cmds[i]} → ${cmds[i + 1]}`;
    inc(bigramFreq, bg);
  }
}

// ─── Player behavior ──────────────────────────────────────────────────────────

const playerTypeFreq = new Map<string, number>();
const mostUsedCmdFreq = new Map<string, number>();
const segments: Record<string, string> = {};

for (const r of pbData.records) {
  inc(playerTypeFreq, r.player_type);
  if (r.most_used_command) inc(mostUsedCmdFreq, r.most_used_command);
  const hint = segmentHint(r);
  if (hint) segments[r.user_id] = hint;
}

// ─── Reward parsing ───────────────────────────────────────────────────────────

const coinsByCommand = new Map<string, number[]>();

for (const r of reData.records) {
  if (r.reward_type === 'error') continue;
  const coins = parseCowoncy(r.reward_value);
  if (coins === null) continue;
  const list = coinsByCommand.get(r.command) ?? [];
  list.push(coins);
  coinsByCommand.set(r.command, list);
}

const rewardStats: Record<string, { count: number; median: number | null; max: number }> = {};
for (const [cmd, vals] of coinsByCommand) {
  rewardStats[cmd] = {
    count: vals.length,
    median: median(vals),
    max: Math.max(...vals),
  };
}

// ─── Economy recommendations ──────────────────────────────────────────────────

const dailyMedian = rewardStats.daily?.median ?? 5000;
const questTotalTarget = Math.round(Math.max(3900, Math.min(5500, dailyMedian * 0.9)));
const questRewards = {
  hunt: Math.round(questTotalTarget * 0.22),
  craft: Math.round(questTotalTarget * 0.24),
  tame: Math.round(questTotalTarget * 0.32),
  market: Math.round(questTotalTarget * 0.22),
};

// ─── Output ───────────────────────────────────────────────────────────────────

const topBigrams = topN(bigramFreq, 15);
const topSequences = topN(sequenceFreq, 10);
const topCommands = topN(cmdFreq, 25);

const flowHints = {
  huntLoop: 'Sırada: `{p} sell` · `{p} duel` · `{p} hunt`',
  afterDaily: topBigrams.find((b) => b.key.startsWith('daily →'))?.key ?? 'daily → cf',
  afterQuests: 'Görevler bitti → `{p} cf` veya `{p} hunt`',
  encounterLoop: 'OwO `b` = `{p} duel` · Loot için encounter\'da **Savaş**',
};

const insights = {
  generatedAt: new Date().toISOString(),
  sourceGuildId: pbData.records[0]?.guild_id ?? null,
  summary: {
    commandRecords: cmdData.records.length,
    playerRecords: pbData.records.length,
    rewardRecords: reData.records.length,
    sequenceRecords: spData.records.length,
  },
  topCommands,
  topBigrams,
  topSequences,
  playerTypes: topN(playerTypeFreq, 10),
  mostUsedByPlayers: topN(mostUsedCmdFreq, 15),
  peakHoursUtc: topN(hourUtc, 8),
  rewardStats,
  economyRecommendations: {
    owoDailyMedianCowoncy: dailyMedian,
    suggestedQuestTotalCoins: questTotalTarget,
    suggestedDAILY_QUEST_CONFIG: questRewards,
    suggestedDUEL_DAILY_COIN_CAP: Math.round(Math.max(600, (rewardStats.cf?.median ?? 0) * 2) || 800),
    encounterFightMinCoins: 600,
  },
  flowHints,
  owoToOwlAliases: {
    h: 'hunt', wh: 'hunt', hunt: 'hunt',
    b: 'duel', wb: 'duel', battle: 'duel',
    s: 'sell', ws: 'sell', sell: 'sell',
    st: 'stats', stats: 'stats',
    daily: 'quests', wdaily: 'quests',
    cash: 'cash', c: 'cash', money: 'cash',
    cf: 'cf', slot: 'slot', bj: 'bj',
    top: 'lb', lb: 'lb', pray: 'buffs',
    use: 'use', u: 'use',
  },
};

writeFileSync(join(DATALAR, 'owo-insights.json'), JSON.stringify(insights, null, 2));
writeFileSync(join(OUT_DATA, 'owo-insights.json'), JSON.stringify(insights, null, 2));
writeFileSync(join(OUT_DATA, 'owo-segments.json'), JSON.stringify(segments, null, 2));
writeFileSync(join(OUT_DATA, 'owo-flow-hints.json'), JSON.stringify(flowHints, null, 2));

console.log('✅ owo-insights.json yazıldı');
console.log(`   Top komutlar: ${topCommands.slice(0, 5).map((x) => x.key).join(', ')}`);
console.log(`   Top bigram: ${topBigrams[0]?.key ?? '—'}`);
console.log(`   Quest coin önerisi: ${JSON.stringify(questRewards)} (toplam ~${questTotalTarget})`);
console.log(`   Segment ipuçları: ${Object.keys(segments).length} oyuncu`);
