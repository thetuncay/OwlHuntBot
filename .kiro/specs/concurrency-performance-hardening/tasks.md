# Implementation Plan: Concurrency & Performance Hardening

## Overview

Six targeted fixes to eliminate the discrete bottlenecks identified in the design. Each task is scoped to the minimum files needed. Tasks are ordered so each change is independently verifiable before the next begins.

## Tasks

- [x] 1. Verify parallel DB reads (Req 1 — no code change)
  - Read `src/systems/hunt.ts` and confirm the three Prisma calls (`getPlayerBundle`, `owl.findUnique`, `getBuffEffects`) are already wrapped in a single `Promise.all` with no intermediate `await` between them.
  - If they are already parallel, no code change is needed — mark this task complete.
  - If they are sequential, refactor to `Promise.all` before proceeding.
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Replace per-item inventory jobs with a single BulkWrite in `hunt.ts` (Req 2)
  - [x] 2.1 Implement `buildAndExecuteBulkWrite` in `src/systems/hunt.ts`
    - Extract the database name from `process.env.DATABASE_URL` (parse the path segment after the last `/` and before any `?`).
    - Build a `prisma.$runCommandRaw` payload with `bulkWrite: 1`, `nsInfo: [{ ns: \`${dbName}.InventoryItem\` }]`, and an `ops` array where each entry is an `update` with `filter: { ownerId, itemName }`, `updateMods: { $inc: { quantity }, $setOnInsert: { ownerId, itemName, itemType, rarity } }`, `upsert: true`, `multi: false`.
    - Wrap the call in a zero-items guard: skip entirely when the catches array is empty.
    - Attach `.catch((err) => console.error('[Hunt] BulkWrite failed:', err.message))` so failures are logged but do not surface to the user.
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 2.2 Replace `enqueueDbWriteBulk` call with `buildAndExecuteBulkWrite` in `hunt.ts`
    - Remove the `enqueueDbWriteBulk(inventoryJobs)` call from the hunt execution path.
    - Add `buildAndExecuteBulkWrite(prisma, playerId, inventoryJobs)` (fire-and-forget with `.catch`) in its place.
    - Leave `enqueueDbWriteBulk` and `UpsertInventoryJob` intact — other callers (crafting, market) still use them.
    - _Requirements: 2.1, 2.3_

  - [x]* 2.3 Write property test for BulkWrite payload construction (Property 3)
    - **Property 3: Bulk inventory write issues exactly one round-trip**
    - Use `fast-check`: generate arrays of 1–20 random item records; mock `prisma.$runCommandRaw`; assert it is called exactly once and `payload.ops.length === items.length`.
    - **Validates: Requirements 2.1, 2.2, 2.3**

  - [x]* 2.4 Write property test for zero-item BulkWrite skip (Property 4)
    - **Property 4: Zero-item hunts skip the BulkWrite call**
    - Use `fast-check` with `fc.constant([])`: mock `prisma.$runCommandRaw`; assert it is never called.
    - **Validates: Requirements 2.4**

- [x] 3. Decouple animation from the critical reply path (Req 3)
  - [x] 3.1 Export `buildFinalMessage` (or equivalent) from `hunt-ux.ts`
    - Identify the function in `src/utils/hunt-ux.ts` (or equivalent) that constructs the final result embed/content.
    - Export it so `owl-hunt.ts` can call it directly before starting animation.
    - _Requirements: 3.1_

  - [x] 3.2 Remove `await` from animation calls in `src/commands/owl-hunt.ts`
    - For the slash-command path: call `await interaction.editReply(buildFinalHuntMessage(...))` first, then fire `animateHuntInteraction(...).catch(() => {})` without `await`.
    - For the prefix-command path: call `await message.reply(buildFinalHuntMessage(...))` first, then fire `animateHuntMessage(...).catch(() => {})` without `await`.
    - _Requirements: 3.1, 3.2, 3.5, 3.6_

  - [x] 3.3 Export `buildResultScreen` (or equivalent) from `pvp-ux.ts` and remove `await` from animation calls in `src/commands/owl-pvp.ts`
    - Identify the function in `src/utils/pvp-ux.ts` (or equivalent) that constructs the final PvP result embed/content.
    - Export it so `owl-pvp.ts` can call it directly before starting animation.
    - For the slash-command path: call `await interaction.editReply(buildResultScreen(...))` first, then fire `animatePvPInteraction(...).catch(() => {})` without `await`.
    - For the prefix-command path: call `await message.reply(buildResultScreen(...))` first, then fire `animatePvPMessage(...).catch(() => {})` without `await`.
    - _Requirements: 3.3, 3.4, 3.5, 3.6_

  - [x]* 3.4 Write property test for animation error suppression (Property 6)
    - **Property 6: Animation errors do not propagate to the command handler**
    - Use `fast-check` with `fc.anything()` as the thrown error value; mock the animation function to throw; run the command handler; assert no unhandled rejection and that `editReply` was called before the animation was invoked.
    - **Validates: Requirements 3.5, 3.6**

- [x] 4. Checkpoint — verify animation decoupling
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Remove `refreshPowerScore` from the hunt path (Req 4)
  - In `src/systems/hunt.ts`, locate the block:
    ```typescript
    if (xpResult.levelUp) {
      refreshPowerScore(prisma, playerId).catch(() => null);
    }
    ```
  - Delete these three lines entirely.
  - Confirm `refreshPowerScore` is not called anywhere else in the `rollHunt` call stack.
  - _Requirements: 4.1_

  - [x]* 5.1 Write property test for refreshPowerScore removal (Property 7)
    - **Property 7: refreshPowerScore is never called during hunt execution**
    - Mock `refreshPowerScore`; run `rollHunt` with a level-up scenario (fixed RNG seed that guarantees `levelUp: true`); assert the mock is never called.
    - **Validates: Requirements 4.1**

- [x] 6. Add `checkKeysPipelined` to the cooldown module (Req 7)
  - [x] 6.1 Implement `checkKeysPipelined` in `src/middleware/cooldown.ts` (or `src/utils/cooldown.ts`)
    - Accept `(redis: Redis, keys: string[])` and return `Promise<Array<{ value: string | null; ttlMs: number }>>`.
    - Build a single `redis.pipeline()`, issue one `GET` and one `PTTL` per key, then call `exec()`.
    - If `exec()` returns `null`, return `keys.map(() => ({ value: null, ttlMs: 0 }))`.
    - For each pair of entries in the result array, extract `value` and `ttlMs`; treat any entry whose first element (error) is non-null as `null` / `0`.
    - Wrap the entire function body in `try/catch`; on any thrown error return the same safe-default array.
    - Export the function.
    - _Requirements: 7.1, 7.2, 7.3_

  - [x] 6.2 Use `checkKeysPipelined` in command handlers where 2+ Redis reads occur back-to-back
    - In `src/commands/owl-hunt.ts`: replace any sequential `getCooldownRemainingMs` + `redis.get` calls at command entry with a single `checkKeysPipelined` call; destructure the result array positionally.
    - In `src/commands/owl-pvp.ts`: if the slash-command path still has sequential `redis.get` calls for `pvpLockKey` and `defenderLockKey`, replace them with `checkKeysPipelined`; the prefix path already uses `Promise.all` — leave it if it is already parallel.
    - _Requirements: 7.1, 7.2_

  - [x]* 6.3 Write property test for pipeline correctness (Property 8)
    - **Property 8: Cooldown pipeline returns correct values per key**
    - Use `fast-check`: generate arrays of 1–10 `(key, ttlMs)` pairs; mock `redis.pipeline().exec()` to return controlled values; assert each returned entry matches the expected `value` and `ttlMs` at the correct positional index.
    - **Validates: Requirements 7.1, 7.2**

  - [x]* 6.4 Write property test for pipeline failure handling (Property 9)
    - **Property 9: Pipeline failure is handled gracefully**
    - Use `fast-check`: generate arrays of 1–10 key strings; mock `pipeline.exec()` to return `null`; assert the function returns an array of length `keys.length` with all `{ value: null, ttlMs: 0 }` entries and does not throw. Also test with exec results that contain error entries.
    - **Validates: Requirements 7.3**

- [x] 7. Tune the Prisma connection pool (Req 5)
  - [x] 7.1 Update `.env` and `.env.example` with pool parameters
    - In `.env`: append `?connection_limit=10&pool_timeout=10` to the `DATABASE_URL` value (use `&` if the URL already contains `?`).
    - In `.env.example`: append the same parameters and add the two inline comments above the line:
      ```
      # connection_limit=10: stays within Atlas M0's connection cap (10 per process instance)
      # pool_timeout=10: prevents indefinite queuing under burst load (fails fast after 10s)
      ```
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 7.2 Update `PrismaClient` instantiation in `src/index.ts` (or wherever it is constructed)
    - Replace `new PrismaClient()` with:
      ```typescript
      function appendPoolParams(url: string): string {
        const separator = url.includes('?') ? '&' : '?';
        return `${url}${separator}connection_limit=10&pool_timeout=10`;
      }
      const prisma = new PrismaClient({
        datasources: { db: { url: appendPoolParams(process.env.DATABASE_URL!) } },
      });
      ```
    - If `PrismaClient` is already instantiated with a `datasources` override, append the pool params to the existing URL string using the same `appendPoolParams` helper.
    - _Requirements: 5.1, 5.5_

- [x] 8. Verify MongoDB index is present and pushed (Req 6)
  - Read `prisma/schema.prisma` and confirm `@@index([ownerId, isMain])` exists on the `Owl` model.
  - Run `npx prisma db push` to confirm the index is propagated to the database (idempotent — safe to run).
  - No schema file change is expected; this task is verification only.
  - _Requirements: 6.1, 6.2, 6.3_

- [x] 9. Final checkpoint — ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP.
- Each task references specific requirements for traceability.
- Property tests use [fast-check](https://github.com/dubzzz/fast-check) (TypeScript-native).
- `enqueueDbWriteBulk` and `UpsertInventoryJob` are intentionally left intact — only the hunt path switches to BulkWrite.
- The `appendPoolParams` helper guards against double `?` if `DATABASE_URL` already has query parameters.
- Req 1 and Req 6 are already implemented; their tasks are verification steps only.
