# Design Document: Concurrency & Performance Hardening

## Overview

OwlHuntBot is a single-process Node.js Discord bot (TypeScript, discord.js v14, Prisma 6, MongoDB Atlas M0, Redis via ioredis). Under concurrent load of 20+ simultaneous users, six discrete bottlenecks cause measurable latency degradation:

1. Sequential database reads at the start of each hunt (partially addressed by the existing cache layer, but the underlying Prisma calls still need to be verified as parallel)
2. Per-item inventory writes generating N individual BullMQ jobs, each becoming a separate MongoDB round-trip
3. Animation sequences blocking the critical reply path via `await`
4. A redundant `refreshPowerScore` call triggered on every level-up during a hunt
5. An under-tuned Prisma connection pool with no explicit limits
6. Sequential Redis calls in the cooldown checker that could be pipelined

This design covers only the targeted fixes for these six bottlenecks. Game logic, balance values, formulas, naming conventions, and all systems outside the explicitly listed scope are untouched.

### Current State Summary

After reading the source code, the actual current state is:

| Requirement | Current State |
|---|---|
| Req 1: Parallel DB reads | `hunt.ts` already uses `Promise.all([getPlayerBundle, owl.findUnique, getBuffEffects])`. The cache layer (`getPlayerBundle`) wraps the Player + mainOwl fetch. This is already parallel. |
| Req 2: Bulk inventory write | `enqueueDbWriteBulk` queues individual `upsertInventory` jobs. Each job becomes a separate `prisma.inventoryItem.upsert` call in the BullMQ worker — N round-trips. |
| Req 3: Animation decoupled | `animateHuntInteraction` and `animateHuntMessage` are `await`ed in `owl-hunt.ts`. `animatePvPInteraction` and `animatePvPMessage` are `await`ed in `owl-pvp.ts`. |
| Req 4: Remove refreshPowerScore from hunt | `refreshPowerScore` is called in `hunt.ts` only on `levelUp`. Must be removed entirely from the hunt path. |
| Req 5: Connection pool tuning | `new PrismaClient()` with no pool params. `.env` and `.env.example` lack `connection_limit` and `pool_timeout`. |
| Req 6: MongoDB index | `@@index([ownerId, isMain])` **already exists** in `prisma/schema.prisma`. No schema change needed. |
| Req 7: Redis pipeline | `getCooldownRemainingMs` uses a Lua script (single round-trip). However, the hunt and duel commands call `getCooldownRemainingMs` and then separately call `redis.get` for PvP lock checks — these sequential calls can be pipelined. |

---

## Architecture

The bot runs as a single Node.js process. All changes are confined to the application layer — no new infrastructure, no new services, no new dependencies.

```
Discord Gateway
      │
      ▼
discord.js Client (src/index.ts)
      │
      ├── Command Handlers (src/commands/)
      │     ├── owl-hunt.ts  ← Req 3: remove await on animation
      │     └── owl-pvp.ts   ← Req 3: remove await on animation
      │
      ├── Systems (src/systems/)
      │     ├── hunt.ts      ← Req 2: bulk inventory write; Req 4: remove refreshPowerScore
      │     └── leaderboard.ts ← Req 4: refreshPowerScore stays here (cache-miss path)
      │
      ├── Middleware (src/middleware/)
      │     └── cooldown.ts  ← Req 7: pipeline Redis reads
      │
      ├── Utils (src/utils/)
      │     └── db-queue.ts  ← Req 2: BulkWrite worker job
      │
      └── Infrastructure
            ├── prisma/schema.prisma  ← Req 6: index already present (no change)
            ├── src/index.ts          ← Req 5: PrismaClient pool params
            ├── .env                  ← Req 5: connection string params
            └── .env.example          ← Req 5: connection string params + comment
```

### Change Isolation Principle

Each fix is scoped to the minimum number of files. No cross-cutting refactors. The changes are additive or substitutive within existing function bodies — no new modules, no new abstractions.

---

## Components and Interfaces

### Requirement 1: Parallel DB Reads (Already Implemented)

The existing `rollHunt` function in `src/systems/hunt.ts` already issues the three reads in parallel:

```typescript
const [bundle, owl, buffEffects] = await Promise.all([
  getPlayerBundle(redis, prisma, playerId),          // Player + mainOwl (cache-first)
  prisma.owl.findUnique({ where: { id: owlId } }),   // The specific owl being used
  getBuffEffects(prisma, playerId, 'hunt'),           // PlayerBuff records
]);
```

No code change is required for Requirement 1. The design documents this as already correct.

### Requirement 2: Bulk Inventory Write

**Current flow:**
```
rollHunt → enqueueDbWriteBulk([job1, job2, ...jobN])
         → BullMQ queue → Worker processes each job individually
         → N × prisma.inventoryItem.upsert (N round-trips)
```

**Target flow:**
```
rollHunt → buildBulkWriteCommand([item1, item2, ...itemN])
         → prisma.$runCommandRaw({ bulkWrite: ... })  (1 round-trip)
```

The change replaces the `enqueueDbWriteBulk(inventoryJobs)` call in `hunt.ts` with a direct `prisma.$runCommandRaw` call that issues a single MongoDB `bulkWrite` command.

**BulkWrite command structure:**

```typescript
await prisma.$runCommandRaw({
  bulkWrite: 1,
  nsInfo: [{ ns: `${dbName}.InventoryItem` }],
  ops: catches.map(item => ({
    update: {
      filter: { ownerId: playerId, itemName: item.itemName },
      updateMods: {
        $inc: { quantity: item.quantity },
        $setOnInsert: {
          ownerId: playerId,
          itemName: item.itemName,
          itemType: item.itemType,
          rarity: item.rarity,
        },
      },
      upsert: true,
      multi: false,
    },
  })),
});
```

The database name is extracted from `process.env.DATABASE_URL` at call time (or passed as a parameter). The collection name matches the Prisma-generated collection for `InventoryItem`.

**Zero-items guard:** The call is skipped entirely when `inventoryJobs.length === 0`.

**Interface change in `hunt.ts`:**
- Remove: `enqueueDbWriteBulk(inventoryJobs)`
- Add: `if (inventoryJobs.length > 0) { await buildAndExecuteBulkWrite(prisma, playerId, inventoryJobs); }`

The `UpsertInventoryJob` type and `enqueueDbWriteBulk` remain available for other callers (crafting, market, etc.) — only the hunt path changes.

### Requirement 3: Animation Decoupled from Critical Reply Path

**Hunt command (`src/commands/owl-hunt.ts`):**

Current (slash):
```typescript
await animateHuntInteraction({ editReply: interaction.editReply.bind(interaction) }, name, compressed);
```

Target (slash):
```typescript
await interaction.editReply({ content: buildFinalHuntMessage(name, compressed) });
animateHuntInteraction({ editReply: interaction.editReply.bind(interaction) }, name, compressed)
  .catch(() => {});
```

Current (prefix):
```typescript
await animateHuntMessage(message, name, compressed);
```

Target (prefix):
```typescript
await message.reply(buildFinalHuntMessage(name, compressed));
animateHuntMessage(message, name, compressed).catch(() => {});
```

**Note:** `animateHuntInteraction` and `animateHuntMessage` currently send the final message themselves (they call `editReply`/`reply` internally). To decouple, the final result message must be sent before animation starts. This requires either:
- (a) Extracting `buildFinalMessage` from `hunt-ux.ts` as a separate export and calling it directly before the animation, or
- (b) Restructuring the animation functions to accept an already-sent message and only perform the frame edits.

Option (a) is simpler and requires fewer changes. `buildFinalMessage` is already defined in `hunt-ux.ts` — it just needs to be exported.

**PvP command (`src/commands/owl-pvp.ts`):**

The PvP animation functions (`animatePvPInteraction`, `animatePvPMessage`) already send the VS screen and result screen themselves. The decoupling pattern is:

Current:
```typescript
await animatePvPInteraction(interaction, battleData);
```

Target:
```typescript
await interaction.editReply({ content: buildResultScreen(battleData) });
animatePvPInteraction(interaction, battleData).catch(() => {});
```

Similarly, `buildResultScreen` needs to be exported from `pvp-ux.ts`.

**Error suppression:** All unawaited animation promises must have `.catch(() => {})` attached. This prevents unhandled promise rejections from Discord rate-limit errors (HTTP 429) or network timeouts from surfacing as process-level errors.

### Requirement 4: Remove refreshPowerScore from Hunt

**Current state in `hunt.ts`:**
```typescript
if (xpResult.levelUp) {
  refreshPowerScore(prisma, playerId).catch(() => null);
}
```

**Change:** Delete these three lines entirely.

**Leaderboard command behavior (no change needed):** The `getLeaderboard` function in `leaderboard.ts` already handles cache misses by fetching from DB. The `refreshPowerScore` function is already called from the `recordStats` BullMQ job when `rareFinds > 0`. The leaderboard will reflect current state on the next cache miss or explicit refresh.

**Requirement 4.2 clarification:** The leaderboard command does not currently call `refreshPowerScore` on cache miss — it calls `fetchFromDB` which reads the stored `powerScore` field. The `powerScore` field is updated by `refreshPowerScore` which is called from the `recordStats` queue job. This chain is sufficient: hunt → queue job → refreshPowerScore → powerScore updated → leaderboard reads updated value. No additional change to the leaderboard command is needed.

### Requirement 5: Prisma Connection Pool Tuning

**`src/index.ts`:**

Current:
```typescript
const prisma = new PrismaClient();
```

Target:
```typescript
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: `${process.env.DATABASE_URL}?connection_limit=10&pool_timeout=10`,
    },
  },
});
```

**Note:** If `DATABASE_URL` already contains query parameters, the append must use `&` not `?`. A safe helper:

```typescript
function appendPoolParams(url: string): string {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}connection_limit=10&pool_timeout=10`;
}
```

**`.env`:**
```
DATABASE_URL=mongodb://localhost:27017/baykusbot?connection_limit=10&pool_timeout=10
```

**`.env.example`:**
```
# connection_limit=10: stays within Atlas M0's 500-connection cap (10 per process instance)
# pool_timeout=10: prevents indefinite queuing under burst load (fails fast after 10s)
DATABASE_URL=mongodb+srv://user:password@cluster.mongodb.net/baykusbot?connection_limit=10&pool_timeout=10
```

### Requirement 6: MongoDB Index (Already Present)

The `prisma/schema.prisma` file already contains:

```prisma
model Owl {
  // ...
  @@index([ownerId, isMain])
  @@index([ownerId, passiveMode])
}
```

No schema change is required. The index exists. Running `npx prisma db push` will confirm the index is propagated to the database (idempotent operation).

### Requirement 7: Redis Pipeline for Cooldown Checks

**Current state:** `getCooldownRemainingMs` in `src/middleware/cooldown.ts` uses a Lua script — already a single round-trip. However, the hunt and duel command handlers make sequential Redis calls:

In `owl-hunt.ts` (prefix path):
```typescript
const remaining = await getCooldownRemainingMs(ctx.redis, cooldownKey, HUNT_COOLDOWN_MS);
// ... then separately:
const bundle = await getPlayerBundle(ctx.redis, ctx.prisma, userId);
```

In `owl-pvp.ts`:
```typescript
const challengerActive = await ctx.redis.get(pvpLockKey);
// ...
const defenderActive = await ctx.redis.get(defenderLockKey);
```

The PvP prefix handler already pipelines these two:
```typescript
const [alreadyActive, defenderActive] = await Promise.all([
  ctx.redis.get(pvpLockKey),
  ctx.redis.get(`pvp:active:${defenderId}`),
]);
```

**Target:** Add a `checkCooldownPipelined` function to `src/middleware/cooldown.ts` that batches multiple cooldown/lock reads into a single pipeline:

```typescript
/**
 * Checks multiple Redis keys in a single pipeline round-trip.
 * Returns an array of [value, ttlMs] pairs in the same order as the input keys.
 * Handles null exec() result and per-entry errors gracefully.
 */
export async function checkKeysPipelined(
  redis: Redis,
  keys: string[],
): Promise<Array<{ value: string | null; ttlMs: number }>> {
  try {
    const pipeline = redis.pipeline();
    for (const key of keys) {
      pipeline.get(key);
      pipeline.pttl(key);
    }
    const results = await pipeline.exec();
    if (!results) return keys.map(() => ({ value: null, ttlMs: 0 }));

    return keys.map((_, i) => {
      const valueEntry = results[i * 2];
      const ttlEntry = results[i * 2 + 1];
      const value = (valueEntry && !valueEntry[0]) ? (valueEntry[1] as string | null) : null;
      const ttlMs = (ttlEntry && !ttlEntry[0]) ? Math.max(0, ttlEntry[1] as number) : 0;
      return { value, ttlMs };
    });
  } catch {
    return keys.map(() => ({ value: null, ttlMs: 0 }));
  }
}
```

This function is used in command handlers where two or more Redis reads happen back-to-back at the start of a command (e.g., cooldown check + PvP lock check).

---

## Data Models

No new Prisma models are introduced. No existing models are modified.

### Relevant Existing Models

**`InventoryItem`** (used by Req 2):
```prisma
model InventoryItem {
  id       String @id @default(uuid()) @map("_id")
  ownerId  String
  itemName String
  itemType String
  rarity   String
  quantity Int    @default(1)

  @@unique([ownerId, itemName])  // Used as the upsert filter key
  @@index([ownerId])
  @@index([ownerId, itemType])
}
```

The `@@unique([ownerId, itemName])` constraint is the basis for the BulkWrite upsert filter. The MongoDB collection name is `InventoryItem` (Prisma default for MongoDB: PascalCase model name).

**`Owl`** (Req 6 — index already present):
```prisma
model Owl {
  // ...
  @@index([ownerId, isMain])   // Already exists — no change needed
  @@index([ownerId, passiveMode])
}
```

### Environment Configuration

**Connection string format (Req 5):**
```
mongodb+srv://user:pass@host/dbname?connection_limit=10&pool_timeout=10
```

- `connection_limit=10`: Caps the Prisma connection pool at 10 connections. Atlas M0 allows up to 500 connections; 10 per process instance leaves headroom for multiple deployments and other clients.
- `pool_timeout=10`: After 10 seconds of waiting for a free connection, Prisma throws `PrismaClientKnownRequestError` with code `P2024` instead of queuing indefinitely. This surfaces backpressure as a visible error rather than silent latency accumulation.

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Parallel DB reads are concurrent

*For any* valid `playerId`, the three Prisma calls issued at the start of `rollHunt` (player bundle, owl lookup, buff effects) SHALL all be initiated before any of them resolves — i.e., they are passed to a single `Promise.all` call with no intermediate `await`.

**Validates: Requirements 1.1, 1.2**

### Property 2: Hunt outcome is deterministic given fixed inputs

*For any* valid `(playerId, owlId, biomeId)` combination and a fixed RNG seed, the hunt outcome (catches array, totalXP, levelUp) SHALL be identical regardless of whether the DB reads are issued sequentially or in parallel.

**Validates: Requirements 1.3**

### Property 3: Bulk inventory write issues exactly one round-trip

*For any* hunt result with N ≥ 1 captured items, `prisma.$runCommandRaw` SHALL be called exactly once, and the BulkWrite payload SHALL contain exactly N upsert operations (one per captured item).

**Validates: Requirements 2.1, 2.2, 2.3**

### Property 4: Zero-item hunts skip the BulkWrite call

*For any* hunt result where the catches array is empty, `prisma.$runCommandRaw` SHALL NOT be called.

**Validates: Requirements 2.4**

### Property 5: Result embed is sent before animation starts

*For any* hunt or PvP execution, `interaction.editReply` (or `message.reply`) with the result content SHALL be called and resolved before the animation function is invoked.

**Validates: Requirements 3.1, 3.3**

### Property 6: Animation errors do not propagate to the command handler

*For any* error thrown by `animateHuntMessage`, `animateHuntInteraction`, `animatePvPMessage`, or `animatePvPInteraction`, the error SHALL be suppressed by a `.catch(() => {})` handler and SHALL NOT cause an unhandled promise rejection or affect the already-sent result embed.

**Validates: Requirements 3.5, 3.6**

### Property 7: refreshPowerScore is never called during hunt execution

*For any* hunt execution (regardless of outcome, level-up status, or captured items), `refreshPowerScore` SHALL NOT be called at any point in the `rollHunt` call stack.

**Validates: Requirements 4.1**

### Property 8: Cooldown pipeline returns correct values per key

*For any* set of Redis keys passed to `checkKeysPipelined`, the returned array SHALL contain the correct `value` and `ttlMs` for each key at the corresponding positional index, matching what individual `GET` and `PTTL` calls would return.

**Validates: Requirements 7.1, 7.2**

### Property 9: Pipeline failure is handled gracefully

*For any* condition where `pipeline.exec()` returns `null` or where individual pipeline entries contain errors, `checkKeysPipelined` SHALL return a result array of the same length as the input keys (with `null` values and `0` ttlMs for failed entries) and SHALL NOT throw an exception.

**Validates: Requirements 7.3**

---

## Error Handling

### Bulk Inventory Write Failures (Req 2)

`prisma.$runCommandRaw` can fail if MongoDB is unreachable or the command is malformed. Since inventory writes are not on the critical reply path (the user has already received their hunt result), failures should be logged but not surfaced to the user.

```typescript
if (inventoryJobs.length > 0) {
  buildAndExecuteBulkWrite(prisma, playerId, inventoryJobs)
    .catch((err) => console.error('[Hunt] BulkWrite failed:', err.message));
}
```

This is consistent with the existing fire-and-forget pattern for background writes.

### Animation Failures (Req 3)

Animation errors (Discord rate limits, network timeouts, unknown interaction errors) are suppressed via `.catch(() => {})`. The user retains the result embed sent before animation started. No logging is required for animation failures — they are expected under Discord rate limiting.

### Connection Pool Exhaustion (Req 5)

When all 10 connections are in use and a new request waits more than 10 seconds, Prisma throws `PrismaClientKnownRequestError` with code `P2024`. This error propagates up to the command handler's existing `try/catch` block, which replies with a generic error message. No additional handling is needed.

### Pipeline Failures (Req 7)

`checkKeysPipelined` catches all errors and returns a safe default (null values, 0 TTL). This means a Redis failure during cooldown checking will allow the command to proceed as if no cooldown is active — consistent with the existing behavior of `getCooldownRemainingMs` which also fails open on Redis errors (with the exception of the anti-flood Lua script which throws).

---

## Testing Strategy

### Unit Tests

Unit tests verify specific behaviors with concrete examples and mock dependencies.

**Req 2 — BulkWrite payload construction:**
- Given a list of 3 captured items, verify the constructed `$runCommandRaw` payload contains exactly 3 upsert operations with correct `filter`, `$inc`, and `$setOnInsert` fields.
- Given an empty captures list, verify `$runCommandRaw` is not called.

**Req 3 — Animation decoupling:**
- Mock `animateHuntMessage` to take 500ms. Verify the command handler resolves in < 50ms (i.e., does not await animation).
- Mock `animateHuntMessage` to throw. Verify no unhandled rejection and the result message is preserved.

**Req 4 — refreshPowerScore removal:**
- Mock `refreshPowerScore`. Run `rollHunt` with a level-up scenario. Verify `refreshPowerScore` is never called.

**Req 7 — Pipeline correctness:**
- Mock `redis.pipeline()` to return a controlled exec result. Verify `checkKeysPipelined` returns the correct values at each index.
- Pass `null` as exec result. Verify the function returns an array of `{ value: null, ttlMs: 0 }` without throwing.
- Pass an exec result with error entries. Verify graceful handling.

### Property-Based Tests

Property-based tests use [fast-check](https://github.com/dubzzz/fast-check) (TypeScript-native, no additional runtime dependency beyond dev). Each test runs a minimum of 100 iterations.

**Property 3 — Bulk inventory write issues exactly one round-trip:**
```
// Feature: concurrency-performance-hardening, Property 3: bulk inventory write issues exactly one round-trip
fc.property(
  fc.array(fc.record({ itemName: fc.string(), itemType: fc.string(), rarity: fc.string(), quantity: fc.integer({ min: 1, max: 10 }) }), { minLength: 1, maxLength: 20 }),
  (items) => {
    // Mock prisma.$runCommandRaw, call buildAndExecuteBulkWrite
    // Assert: called exactly once, payload.ops.length === items.length
  }
)
```

**Property 4 — Zero-item hunts skip BulkWrite:**
```
// Feature: concurrency-performance-hardening, Property 4: zero-item hunts skip BulkWrite
fc.property(
  fc.constant([]),  // empty catches
  (items) => {
    // Assert: prisma.$runCommandRaw never called
  }
)
```

**Property 6 — Animation errors do not propagate:**
```
// Feature: concurrency-performance-hardening, Property 6: animation errors do not propagate
fc.property(
  fc.anything(),  // any error value
  async (errorValue) => {
    // Make animation throw errorValue
    // Run command handler
    // Assert: no unhandled rejection, editReply was called before animation
  }
)
```

**Property 8 — Pipeline returns correct values per key:**
```
// Feature: concurrency-performance-hardening, Property 8: pipeline returns correct values per key
fc.property(
  fc.array(fc.tuple(fc.string(), fc.integer({ min: -1, max: 60000 })), { minLength: 1, maxLength: 10 }),
  async (keyTtlPairs) => {
    // Mock pipeline exec to return controlled values
    // Assert: each returned entry matches the expected value at the correct index
  }
)
```

**Property 9 — Pipeline failure is handled gracefully:**
```
// Feature: concurrency-performance-hardening, Property 9: pipeline failure is handled gracefully
fc.property(
  fc.array(fc.string(), { minLength: 1, maxLength: 10 }),
  async (keys) => {
    // Mock pipeline exec to return null
    // Assert: returns array of length keys.length, no throw
    // Also test with error entries in the result array
  }
)
```

### Integration Tests

Integration tests verify end-to-end behavior against a real (or test) database instance.

- **Req 5:** Start the bot with the updated `DATABASE_URL`. Verify `prisma.$connect()` succeeds and the pool parameters are reflected in the connection.
- **Req 6:** Run `npx prisma db push` against the test database. Verify the `InventoryItem` collection has the `ownerId_isMain` compound index via `db.collection('Owl').indexes()`.
- **Req 4 (integration):** Run a hunt that triggers a level-up. Query the leaderboard. Verify the displayed power score matches the expected value computed from the player's current level and XP.

### Smoke Tests

- **Req 5:** Parse `DATABASE_URL` from `.env` and `.env.example`. Verify both contain `connection_limit=10` and `pool_timeout=10`.
- **Req 6:** Read `prisma/schema.prisma`. Verify `@@index([ownerId, isMain])` is present on the `Owl` model.
