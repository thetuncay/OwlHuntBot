#!/usr/bin/env npx tsx
/**
 * Flow + abuse ops counters (24h rolling) — CLI export.
 * Usage: npx tsx src/scripts/export-flow-metrics.ts
 */
import { redis } from '../utils/redis';
import { getFlowCounts24h } from '../ops/flow-analytics';
import { getAbuseCounts24h } from '../ops/abuse-analytics';

async function main(): Promise<void> {
  const [flow, abuse] = await Promise.all([
    getFlowCounts24h(redis),
    getAbuseCounts24h(redis),
  ]);

  const report = {
    exportedAt: new Date().toISOString(),
    window: '24h',
    intent: {
      impatient: flow.intentImpatient,
      lost: flow.intentLost,
      cooldown: flow.intentCooldown,
      automation: flow.intentAutomation,
    },
    flowReject: {
      validation: flow.flowValidation,
      lock: flow.flowLock,
      cooldown: flow.flowCooldown,
      inflight: flow.flowInflight,
      owl_only: flow.flowOwlOnly,
    },
    abuse: {
      same_cmd: abuse.abuseSameCmd,
      flood: abuse.abuseFlood,
      throttle: abuse.abuseThrottle,
      automation: abuse.abuseAutomation,
    },
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
