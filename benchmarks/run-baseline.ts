/**
 * İzole bench baseline. Gerçek Discord yok. 5433/6380 kullanılmaz.
 *
 *   npx tsx benchmarks/run-baseline.ts --mode hunt --concurrency 10,100
 *   npx tsx benchmarks/run-baseline.ts --mode duel --skip-anim --concurrency 10
 *   npx tsx benchmarks/run-baseline.ts --mode hunt --concurrency 10 --soak-seconds 90
 */
import './load-bench-env.js';

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { performance, monitorEventLoopDelay } from 'node:perf_hooks';
import { PrismaClient } from '@prisma/client';

const args = parseArgs(process.argv.slice(2));
if (args.skipAnim) process.env.SIM_PVP_SKIP_ANIM = '1';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL } },
});

type BenchMods = {
  redis: typeof import('../src/utils/redis.js')['redis'];
  rollHunt: typeof import('../src/systems/hunt.js')['rollHunt'];
  runSimulatedPvP: typeof import('../src/systems/pvp-sim.js')['runSimulatedPvP'];
  animateSimPvPMessage: typeof import('../src/utils/pvp-ux.js')['animateSimPvPMessage'];
  setDbQueuePrisma: typeof import('../src/utils/db-queue.js')['setDbQueuePrisma'];
  initDbQueueProducer: typeof import('../src/utils/db-queue.js')['initDbQueueProducer'];
  closeDbQueue: typeof import('../src/utils/db-queue.js')['closeDbQueue'];
  FakeSentMessage: typeof import('./fake-discord.js')['FakeSentMessage'];
};

let mods: BenchMods;

type Sample = { ok: boolean; ms: number; edits: number; error?: string };

function parseArgs(argv: string[]): {
  mode: 'hunt' | 'duel';
  skipAnim: boolean;
  concurrency: number[];
  soakSeconds: number;
} {
  let mode: 'hunt' | 'duel' = 'hunt';
  let skipAnim = false;
  let concurrency = [10, 100];
  let soakSeconds = 0;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--mode') {
      const v = argv[++i];
      if (v === 'hunt' || v === 'duel') mode = v;
    } else if (a === '--skip-anim') skipAnim = true;
    else if (a === '--soak-seconds') {
      soakSeconds = Number.parseInt(argv[++i] ?? '0', 10);
      if (!Number.isFinite(soakSeconds) || soakSeconds < 0) soakSeconds = 0;
    } else if (a === '--concurrency') {
      const parts: string[] = [];
      while (i + 1 < argv.length && !argv[i + 1]!.startsWith('--')) {
        parts.push(argv[++i]!);
      }
      concurrency = parts
        .join(',')
        .split(',')
        .map((n) => Number.parseInt(n.trim(), 10))
        .filter((n) => Number.isFinite(n) && n > 0);
    }
  }
  return { mode, skipAnim, concurrency, soakSeconds };
}

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i]!;
}

function summarize(samples: Sample[]) {
  const ok = samples.filter((s) => s.ok);
  const times = ok.map((s) => s.ms).sort((a, b) => a - b);
  return {
    n: samples.length,
    ok: ok.length,
    errors: samples.length - ok.length,
    p50: Math.round(pct(times, 50)),
    p95: Math.round(pct(times, 95)),
    p99: Math.round(pct(times, 99)),
    max: times.length ? Math.round(times[times.length - 1]!) : 0,
    editsP50: Math.round(pct(ok.map((s) => s.edits).sort((a, b) => a - b), 50)),
  };
}

async function pool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!, i);
    }
  }
  const n = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return out;
}

async function clearBenchCooldowns(): Promise<void> {
  await mods.redis.eval(
    `local ks = redis.call('KEYS', ARGV[1])
     if #ks > 0 then redis.call('DEL', unpack(ks)) end
     return #ks`,
    0,
    'cooldown:*',
  );
}

async function seedPlayers(count: number): Promise<string[]> {
  const ids: string[] = [];
  const batch = 50;
  for (let i = 0; i < count; i += batch) {
    const n = Math.min(batch, count - i);
    const chunk = await prisma.$transaction(
      Array.from({ length: n }, (_, k) => {
        const id = `bench_${String(i + k).padStart(6, '0')}`;
        ids.push(id);
        return prisma.player.upsert({
          where: { id },
          create: { id, coins: 1000, level: 5, xp: 0 },
          update: {},
        });
      }),
    );
    void chunk;
    await prisma.$transaction(
      ids.slice(i, i + n).map((id) =>
        prisma.owl.upsert({
          where: { id: `owl_${id}` },
          create: {
            id: `owl_${id}`,
            ownerId: id,
            species: 'Blakiston balik baykusu',
            tier: 1,
            hp: 100,
            hpMax: 100,
            staminaCur: 100,
            isMain: true,
            statGaga: 20,
            statGoz: 20,
            statKulak: 20,
            statKanat: 20,
            statPence: 20,
            statGagaBase: 20,
            statGozBase: 20,
            statKulakBase: 20,
            statKanatBase: 20,
            statPenceBase: 20,
          },
          update: { isMain: true },
        }),
      ),
    );
  }
  return ids;
}

async function runHunt(playerId: string): Promise<Sample> {
  const t0 = performance.now();
  try {
    await mods.rollHunt(prisma, mods.redis, playerId, undefined, undefined, false, 'bench-guild');
    return { ok: true, ms: performance.now() - t0, edits: 0 };
  } catch (err) {
    return { ok: false, ms: performance.now() - t0, edits: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

async function runDuel(playerId: string): Promise<Sample> {
  const t0 = performance.now();
  const actions: { tMs: number; kind: string }[] = [];
  try {
    const owl = await prisma.owl.findFirst({
      where: { ownerId: playerId, isMain: true },
      select: {
        species: true, nickname: true, hpMax: true, hp: true, staminaCur: true,
        statGaga: true, statPence: true, statGoz: true, statKulak: true, statKanat: true, tier: true,
      },
    });
    if (!owl) throw new Error('main owl yok');
    const result = await mods.runSimulatedPvP(prisma, playerId, mods.redis, owl);
    const sent = new mods.FakeSentMessage(actions as never, t0);
    await mods.animateSimPvPMessage(sent, playerId, owl, owl.hpMax, result, 'Bench');
    return { ok: true, ms: performance.now() - t0, edits: actions.filter((a) => a.kind === 'edit').length };
  } catch (err) {
    return { ok: false, ms: performance.now() - t0, edits: 0, error: err instanceof Error ? err.message : String(err) };
  }
}

async function main(): Promise<void> {
  const [
    redisMod,
    huntMod,
    pvpMod,
    pvpUxMod,
    queueMod,
    fakeMod,
  ] = await Promise.all([
    import('../src/utils/redis.js'),
    import('../src/systems/hunt.js'),
    import('../src/systems/pvp-sim.js'),
    import('../src/utils/pvp-ux.js'),
    import('../src/utils/db-queue.js'),
    import('./fake-discord.js'),
  ]);
  mods = {
    redis: redisMod.redis,
    rollHunt: huntMod.rollHunt,
    runSimulatedPvP: pvpMod.runSimulatedPvP,
    animateSimPvPMessage: pvpUxMod.animateSimPvPMessage,
    setDbQueuePrisma: queueMod.setDbQueuePrisma,
    initDbQueueProducer: queueMod.initDbQueueProducer,
    closeDbQueue: queueMod.closeDbQueue,
    FakeSentMessage: fakeMod.FakeSentMessage,
  };

  const ping = await mods.redis.ping();
  if (ping !== 'PONG') throw new Error('Bench Redis ping başarısız');
  await prisma.$connect();
  mods.setDbQueuePrisma(prisma);
  mods.initDbQueueProducer();

  const maxN = Math.max(...args.concurrency);
  console.info(`[bench] seed ${maxN} oyuncu mode=${args.mode} skipAnim=${args.skipAnim}`);
  const ids = await seedPlayers(maxN);

  const histogram = monitorEventLoopDelay({ resolution: 20 });
  histogram.enable();

  const waves: Record<string, unknown>[] = [];
  for (const c of args.concurrency) {
    const rss0 = process.memoryUsage();
    const slice = ids.slice(0, c);
    const t0 = performance.now();
    const samples = await pool(slice, c, (id) => (args.mode === 'hunt' ? runHunt(id) : runDuel(id)));
    const wall = performance.now() - t0;
    const rss1 = process.memoryUsage();
    const summary = summarize(samples);
    const wave = {
      concurrency: c,
      wallMs: Math.round(wall),
      rssMb: Math.round(rss1.rss / 1024 / 1024),
      heapMb: Math.round(rss1.heapUsed / 1024 / 1024),
      rssDeltaMb: Math.round((rss1.rss - rss0.rss) / 1024 / 1024),
      eventLoopP99Ms: Math.round(histogram.percentile(99) / 1e6),
      ...summary,
      firstErrors: samples.filter((s) => !s.ok).slice(0, 5).map((s) => s.error),
    };
    waves.push(wave);
    console.info(JSON.stringify(wave));
    await clearBenchCooldowns();
  }

  let soak: Record<string, unknown> | undefined;
  if (args.soakSeconds > 0) {
    const c = args.concurrency[0] ?? 10;
    const slice = ids.slice(0, c);
    const rssStart = process.memoryUsage();
    const t0 = performance.now();
    let rounds = 0;
    let ok = 0;
    let errors = 0;
    const firstErrors: string[] = [];
    const until = t0 + args.soakSeconds * 1000;
    while (performance.now() < until) {
      const samples = await pool(slice, c, (id) => (args.mode === 'hunt' ? runHunt(id) : runDuel(id)));
      ok += samples.filter((s) => s.ok).length;
      for (const s of samples) {
        if (!s.ok) {
          errors += 1;
          if (s.error && firstErrors.length < 8 && !firstErrors.includes(s.error)) {
            firstErrors.push(s.error);
          }
        }
      }
      rounds += 1;
      await clearBenchCooldowns();
    }
    const rssEnd = process.memoryUsage();
    soak = {
      seconds: args.soakSeconds,
      concurrency: c,
      rounds,
      ok,
      errors,
      wallMs: Math.round(performance.now() - t0),
      rssStartMb: Math.round(rssStart.rss / 1024 / 1024),
      rssEndMb: Math.round(rssEnd.rss / 1024 / 1024),
      heapEndMb: Math.round(rssEnd.heapUsed / 1024 / 1024),
      eventLoopP99Ms: Math.round(histogram.percentile(99) / 1e6),
      firstErrors,
    };
    console.info(`[bench] soak ${JSON.stringify(soak)}`);
  }

  histogram.disable();
  const report = {
    at: new Date().toISOString(),
    mode: args.mode,
    skipAnim: args.skipAnim,
    node: process.version,
    waves,
    soak,
  };
  const dir = join(process.cwd(), 'benchmarks', 'results');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = join(
    dir,
    `baseline-${args.mode}${args.skipAnim ? '-skipanim' : ''}-${Date.now()}.json`,
  );
  writeFileSync(file, JSON.stringify(report, null, 2), 'utf8');
  console.info(`[bench] yazıldı ${file}`);

  await prisma.$disconnect();
  try { await mods.closeDbQueue(); } catch { /* */ }
  try { await mods.redis.quit(); } catch { /* */ }
  process.exit(0);
}

main().catch(async (err) => {
  console.error('[bench] FAIL', err);
  try { await prisma.$disconnect(); } catch { /* */ }
  try { await mods?.closeDbQueue(); } catch { /* */ }
  try { await mods?.redis.quit(); } catch { /* */ }
  process.exit(1);
});
