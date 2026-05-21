# Implementation Plan

## Exploratory & Preservation Tests (Run BEFORE any fixes)

- [x] 1. Write bug condition exploration tests (run on UNFIXED code)
  - **Property 1: Bug Condition** - Concurrent Financial Operations Race Condition (S1), Duel Cap Bypass (A2), XP Multiplier Unbounded (A4), usedLines Overflow (P3)
  - **CRITICAL**: These tests MUST FAIL on unfixed code — failure confirms the bugs exist
  - **DO NOT attempt to fix the tests or the code when they fail**
  - **GOAL**: Surface counterexamples that demonstrate each bug exists
  - **Scoped PBT Approach**: Scope each property to the concrete failing case(s) for reproducibility

  - **S1 — Concurrent Lock Race:**
    - Simulate two concurrent `withLock(playerId, 'hunt', fn1)` and `withLock(playerId, 'gamble', fn2)` calls for the same player
    - Assert that both locks can be acquired simultaneously (demonstrating the race window exists)
    - Counterexample: both locks held at the same time → double-spend possible
    - Run on unfixed code — **EXPECTED OUTCOME: FAILS** (both locks acquired simultaneously, confirming bug)

  - **A2 — Duel Cap Bypass:**
    - Call `runSimulatedPvP` 10 times for the same player (mocking wins, mocking Redis to return 0 daily earned)
    - Assert that total coins awarded exceeds `DUEL_DAILY_COIN_CAP` (500)
    - Counterexample: 9 wins × 60 coins = 540 > 500 cap, no enforcement
    - Run on unfixed code — **EXPECTED OUTCOME: FAILS** (total > 500, confirming no cap exists)

  - **A4 — XP Multiplier Unbounded:**
    - Call `finalXP(10, 50)` on unfixed code
    - Assert result > `10 * XP_SCALE_MAX_MULT` (i.e., result > 13)
    - Counterexample: `10 × (1 + 50 × 0.03) = 25` which exceeds the 1.30× cap
    - Run on unfixed code — **EXPECTED OUTCOME: FAILS** (returns 25, not ≤ 13, confirming bug)

  - **P3 — usedLines Grows Beyond Cap:**
    - Create a tame session and simulate 60 turns, each appending a line
    - Assert `state.usedLines.length > TAME_USED_LINES_MAX` (> 50)
    - Counterexample: after 60 turns, `usedLines.length = 60`
    - Run on unfixed code — **EXPECTED OUTCOME: FAILS** (length reaches 60, confirming no cap)

  - Document all counterexamples found to understand root causes
  - Mark task complete when tests are written, run, and failures are documented
  - _Requirements: 1.1, 1.2, 1.7, 1.8, 1.11, 1.12, 1.18, 1.19_

- [x] 2. Write preservation property tests (run on UNFIXED code to establish baseline)
  - **Property 2: Preservation** - Single Financial Operations, Duel Below Cap, Low-Level XP, usedLines Below Cap
  - **IMPORTANT**: Follow observation-first methodology — observe unfixed code behaviour first, then encode it
  - **GOAL**: Establish baseline behaviour that must be preserved after all fixes

  - **S1 Preservation — Sequential Financial Operations:**
    - Observe: a single hunt (no concurrent operation) produces a deterministic coin delta, XP, and inventory result
    - Write property-based test: for all single-player financial operations (no concurrent op), `F(X).finalCoins = F'(X).finalCoins`
    - Verify test PASSES on unfixed code (baseline confirmed)

  - **A2 Preservation — Duel Below Cap:**
    - Observe: `runSimulatedPvP` with `dailyEarned = 0` awards `SIM_PVP_WIN_COINS + bonusCoins` correctly
    - Write property-based test: for all `(dailyEarned, coinsGained)` pairs where `dailyEarned < DUEL_DAILY_COIN_CAP`, `cappedCoins = coinsGained`
    - Verify test PASSES on unfixed code

  - **A4 Preservation — Low-Level XP (levels 1–30):**
    - Observe: `finalXP(baseXP, level)` for levels 1–30 returns `Math.round(baseXP × (1 + level × 0.01))` after rate change
    - Write property-based test: for all `(baseXP, level)` where `level ∈ [1, 30]`, multiplier is between 1.0 and 1.30 (positive bonus preserved)
    - Note: preservation property is that low-level players still receive a positive bonus, not that values match old 0.03 rate
    - Verify test PASSES on unfixed code

  - **P3 Preservation — usedLines Below Cap:**
    - Observe: for sessions with < 50 lines, `addUsedLine(session, line).usedLines = [...session.usedLines, line]`
    - Write property-based test: for all sessions where `usedLines.length < TAME_USED_LINES_MAX`, the new line is appended exactly as before
    - Verify test PASSES on unfixed code

  - **EXPECTED OUTCOME**: All preservation tests PASS (confirms baseline behaviour to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.9, 3.10, 3.13_

---

## S-Tier Fixes (Critical — Race Conditions & Security)

- [x] 3. S1 — Implement unified financial lock across all coin-touching operations

  - [x] 3.1 Change `withLock` action to `'financial'` in `src/systems/hunt.ts`
    - Locate `withLock(playerId, 'hunt', ...)` call
    - Change action argument from `'hunt'` to `'financial'`
    - Verify no other lock calls in this file need updating (non-financial ops keep their own namespaces)
    - _Bug_Condition: isBugCondition_S1(X) where X.op1.lockNamespace ≠ X.op2.lockNamespace_
    - _Expected_Behavior: both ops serialised through `lock:{playerId}:financial`; second op reads balance written by first_
    - _Preservation: single hunt with no concurrent op produces identical coin delta, XP, and inventory_
    - _Requirements: 2.1, 2.2, 3.1_

  - [x] 3.2 Change `withLock` action to `'financial'` in `src/systems/gambling.ts`
    - Locate all `withLock(playerId, 'gamble', ...)` or equivalent calls
    - Change action argument to `'financial'` for all coin-touching gambling operations
    - _Bug_Condition: isBugCondition_S1(X) where concurrent gamble + hunt share different lock namespaces_
    - _Expected_Behavior: gamble and hunt serialised through same `lock:{playerId}:financial` key_
    - _Preservation: gambling with sufficient funds and no concurrent op resolves with same payout rates_
    - _Requirements: 2.1, 2.2, 3.2_

  - [x] 3.3 Change `withLock` action to `'financial'` in `src/systems/transfer.ts`
    - Locate `withLock(senderId, 'transfer', ...)` call
    - Change action argument to `'financial'`
    - _Bug_Condition: isBugCondition_S1(X) where transfer and hunt/gamble use different lock namespaces_
    - _Expected_Behavior: transfer serialised through `lock:{senderId}:financial`_
    - _Preservation: transfer with sufficient funds applies correct tax bracket and updates both balances_
    - _Requirements: 2.1, 2.2, 3.3_

  - [x] 3.4 Change `withLock` action to `'financial'` in `src/systems/lootbox.ts`
    - Locate coin-deducting `withLock` call in lootbox open flow
    - Change action argument to `'financial'`
    - _Bug_Condition: isBugCondition_S1(X) where lootbox and hunt/gamble use different lock namespaces_
    - _Expected_Behavior: lootbox coin deduction serialised through `lock:{playerId}:financial`_
    - _Preservation: lootbox open consumes one lootbox, rolls rarity, applies pity, awards buff item_
    - _Requirements: 2.1, 2.2, 3.4_

  - [x] 3.5 Change `withLock` action to `'financial'` in `src/systems/upgrade.ts`
    - Locate coin-deducting `withLock` call in upgrade flow
    - Change action argument to `'financial'`
    - Confirm non-financial `withLock` calls (repair, maintenance, autosink, tame) are NOT changed
    - _Bug_Condition: isBugCondition_S1(X) where upgrade and other financial ops use different lock namespaces_
    - _Expected_Behavior: upgrade coin deduction serialised through `lock:{playerId}:financial`_
    - _Preservation: non-financial withLock calls (repair, maintenance, autosink, tame) continue using per-operation namespaces_
    - _Requirements: 2.1, 2.2, 3.8_

  - [x] 3.6 Verify bug condition exploration test (Property 1) now passes for S1
    - **Property 1: Expected Behavior** - Unified Financial Lock Prevents Concurrent Acquisition
    - **IMPORTANT**: Re-run the SAME S1 test from task 1 — do NOT write a new test
    - The test from task 1 asserts both locks cannot be held simultaneously
    - **EXPECTED OUTCOME**: Test PASSES (confirms `lock:{playerId}:financial` serialises concurrent ops)
    - _Requirements: 2.1, 2.2_

  - [x] 3.7 Verify S1 preservation tests still pass
    - **Property 2: Preservation** - Sequential Financial Operations Unaffected
    - **IMPORTANT**: Re-run the SAME S1 preservation test from task 2 — do NOT write a new test
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions for single-player financial ops)

- [x] 4. S3 — Move tax calculation inside the financial lock scope in `src/systems/transfer.ts`

  - [x] 4.1 Move `calcTax(amount)` call inside `prisma.$transaction` block
    - Remove `const { tax, received, rate } = calcTax(amount)` from before the `withLock` call
    - Add `const { tax, received, rate } = calcTax(amount)` inside the `prisma.$transaction` callback, after the sender balance check (`if (sender.coins < amount)`)
    - Verify the rest of the transaction logic is unchanged (tax still burned, receiver gets `received` coins)
    - _Bug_Condition: isBugCondition_S3(X) where X.taxCalculatedBeforeLockAcquisition = true_
    - _Expected_Behavior: calcTax called inside prisma.$transaction after sender balance read; entire operation atomic_
    - _Preservation: transfer with sufficient funds applies correct tax bracket and updates both balances identically_
    - _Requirements: 2.5, 2.6, 3.3_

  - [x] 4.2 Verify S3 fix — assert `calcTax` is called inside the transaction scope
    - Write a unit test that spies on `calcTax` and verifies it is invoked after lock acquisition and inside the `prisma.$transaction` callback
    - On fixed code: spy fires inside the transaction (after lock)
    - **EXPECTED OUTCOME**: Test PASSES (confirms tax is computed atomically)
    - _Requirements: 2.6_

---

## A-Tier Fixes (High — Abusable Behaviours)

- [x] 5. A2 — Implement bot duel daily coin earnings cap

  - [x] 5.1 Add `DUEL_DAILY_COIN_CAP` constant to `src/config.ts`
    - Add `export const DUEL_DAILY_COIN_CAP = 500;`
    - _Requirements: 2.7, 2.8_

  - [x] 5.2 Add daily cap enforcement to `runSimulatedPvP` in `src/systems/pvp-sim.ts`
    - Add `redis: Redis` parameter to `runSimulatedPvP` (already available in the calling command handler)
    - Compute Redis key: `` `duel:daily:${playerId}:${new Date().toISOString().slice(0, 10)}` ``
    - Read current daily total: `const dailyEarned = parseInt(await redis.get(key) ?? '0', 10)`
    - Compute capped coin award: `const cappedCoins = Math.max(0, Math.min(coinsGained, DUEL_DAILY_COIN_CAP - dailyEarned))`
    - If `cappedCoins > 0`: `await redis.incrby(key, cappedCoins)` and `await redis.expire(key, 25 * 60 * 60)`
    - Replace `coinsGained` with `cappedCoins` in `prisma.player.update` and `recordCoinsEarned` calls
    - XP (`xpGained`) is NOT affected by the cap — award in full regardless
    - _Bug_Condition: isBugCondition_A2(X) where X.playerWon = true AND X.dailyDuelCoinsEarned >= DUEL_DAILY_COIN_CAP_
    - _Expected_Behavior: cappedCoins = 0 when cap reached; xpGained unchanged; partial award when dailyEarned < cap_
    - _Preservation: duel below cap awards full SIM_PVP_WIN_COINS + streak bonuses; XP always awarded_
    - _Requirements: 2.7, 2.8, 3.5, 3.9_

  - [x] 5.3 Unit test: partial award at cap boundary
    - Mock Redis to return `dailyEarned = 499`; assert `coinsGained = 1` (partial award up to cap)
    - Mock Redis to return `dailyEarned = 500`; assert `coinsGained = 0` and `xpGained > 0`
    - Mock Redis to return `dailyEarned = 0`; assert `coinsGained = SIM_PVP_WIN_COINS + bonusCoins`
    - _Requirements: 2.7, 2.8_

  - [x] 5.4 Verify bug condition exploration test (Property 1) now passes for A2
    - **Property 1: Expected Behavior** - Duel Daily Cap Enforced
    - **IMPORTANT**: Re-run the SAME A2 test from task 1 — do NOT write a new test
    - The test from task 1 asserts total coins after 10 wins does not exceed `DUEL_DAILY_COIN_CAP`
    - **EXPECTED OUTCOME**: Test PASSES (total coins ≤ 500, confirming cap is enforced)
    - _Requirements: 2.7, 2.8_

  - [x] 5.5 Verify A2 preservation tests still pass
    - **Property 2: Preservation** - Duel Below Cap Unchanged
    - **IMPORTANT**: Re-run the SAME A2 preservation test from task 2 — do NOT write a new test
    - **EXPECTED OUTCOME**: Tests PASS (full coin reward awarded when below cap)

- [x] 6. A3 — Enable Redis AOF persistence

  - [x] 6.1 Enable AOF persistence in `redis.conf` or `docker-compose.yml`
    - If using `redis.conf`: add or update `appendonly yes` and `appendfsync everysec`
    - If using Docker Compose: add `command: redis-server --appendonly yes --appendfsync everysec` to the `redis` service
    - No application code changes required — `src/utils/redis.ts` ioredis client is unaffected
    - _Bug_Condition: Redis restarts without AOF → all pity counters and cooldown keys lost_
    - _Expected_Behavior: AOF log survives restart; pity counters and cooldowns restored with ≤ 1 second data loss_
    - _Preservation: existing Redis client connection and all key operations unchanged_
    - _Requirements: 2.9, 2.10_

  - [x] 6.2 Verify AOF configuration is active
    - Run `redis-cli CONFIG GET appendonly` and confirm it returns `yes`
    - Run `redis-cli CONFIG GET appendfsync` and confirm it returns `everysec`
    - _Requirements: 2.9_

- [x] 7. A4 — Implement capped XP scaling formula

  - [x] 7.1 Update XP scaling constants in `src/config.ts`
    - Replace `export const XP_SCALE_RATE = 0.03` with `export const XP_SCALE_RATE = 0.01`
    - Add `export const XP_SCALE_MAX_MULT = 1.30`
    - _Requirements: 2.11, 2.12_

  - [x] 7.2 Apply `Math.min` cap in `finalXP` in `src/utils/math.ts`
    - Import `XP_SCALE_MAX_MULT` from `'../config'` alongside existing `XP_SCALE_RATE` import
    - Replace `Math.round(baseXP * (1 + level * XP_SCALE_RATE))` with `Math.round(baseXP * Math.min(1 + level * XP_SCALE_RATE, XP_SCALE_MAX_MULT))`
    - _Bug_Condition: isBugCondition_A4(X) where (1 + X.playerLevel × XP_SCALE_RATE) > XP_SCALE_MAX_MULT_
    - _Expected_Behavior: finalXP returns Math.round(baseXP × XP_SCALE_MAX_MULT) for all levels > 30_
    - _Preservation: levels 1–30 still receive positive scaling bonus (multiplier between 1.0 and 1.30)_
    - _Requirements: 2.11, 2.12, 3.7, 3.10_

  - [x] 7.3 Unit test: XP cap boundary values
    - Assert `finalXP(10, 0)` = 10 (no bonus at level 0)
    - Assert `finalXP(10, 30)` = 13 (exactly at cap: `1 + 30 × 0.01 = 1.30`)
    - Assert `finalXP(10, 100)` = 13 (cap enforced: same as level 30)
    - Assert `finalXP(10, 1)` = 10 (level 1: `1 + 0.01 = 1.01` → rounds to 10)
    - _Requirements: 2.11, 2.12_

  - [x] 7.4 Verify bug condition exploration test (Property 1) now passes for A4
    - **Property 1: Expected Behavior** - XP Multiplier Capped at XP_SCALE_MAX_MULT
    - **IMPORTANT**: Re-run the SAME A4 test from task 1 — do NOT write a new test
    - The test from task 1 asserts `finalXP(10, 50) > 13`; on fixed code this should now FAIL (i.e., the assertion is false, meaning the bug is gone)
    - Reframe: verify `finalXP(10, 50) <= 10 * XP_SCALE_MAX_MULT` (= 13)
    - **EXPECTED OUTCOME**: Test PASSES (returns 13, confirming cap is enforced)
    - _Requirements: 2.11, 2.12_

  - [x] 7.5 Verify A4 preservation tests still pass
    - **Property 2: Preservation** - Low-Level XP Scaling Unchanged
    - **IMPORTANT**: Re-run the SAME A4 preservation test from task 2 — do NOT write a new test
    - **EXPECTED OUTCOME**: Tests PASS (levels 1–30 still receive positive bonus)

---

## P-Tier Fixes (Performance)

- [x] 8. P1 — Defer pity counter writes to BullMQ background queue

  - [x] 8.1 Add `RecordPityJob` type and handler to `src/utils/db-queue.ts`
    - Add interface:
      ```typescript
      export interface RecordPityJob {
        type: 'recordPity';
        playerId: string;
        lootboxId: string;
        increment: number;  // +1 per open, or 0 to reset
        reset: boolean;     // true = set counter to 0 (on pity trigger)
      }
      ```
    - Add `RecordPityJob` to the `DbWriteJob` union type
    - Add `case 'recordPity'` handler in `processJob` that calls `redis.incrby` or `redis.del` on the pity key
    - _Bug_Condition: isBugCondition_P1(X) where X.pityIncrementIsSync = true_
    - _Expected_Behavior: pity writes enqueued as BullMQ jobs; response path has ≤ 3 synchronous DB ops_
    - _Preservation: eventual pity counter values identical to synchronous writes; pity threshold guarantee unchanged_
    - _Requirements: 2.13, 2.14, 2.15, 3.6, 3.11_

  - [x] 8.2 Replace synchronous pity writes with `enqueueDbWrite` in `src/systems/lootbox.ts`
    - Locate synchronous pity counter write(s) (`redis.incr(pityKey)` or Prisma pity write)
    - Replace with `enqueueDbWrite({ type: 'recordPity', playerId, lootboxId, increment: 1, reset: false })`
    - For pity reset (on pity trigger): enqueue with `reset: true`
    - _Requirements: 2.13, 2.14, 2.15_

  - [x] 8.3 Verify P1 fix — assert hunt response path has ≤ 3 synchronous DB operations
    - Write a unit test that instruments `prisma.player.update` and counts synchronous calls during `rollHunt`
    - Assert `syncDbOps <= 3` (coin balance update, player state update, owl bond update)
    - Assert background job was enqueued (`enqueueDbWrite` called with `type: 'recordPity'`)
    - _Requirements: 2.13, 2.14_

- [x] 9. P2 — Update `powerScore` on every `totalRareFinds` increment

  - [x] 9.1 Call `refreshPowerScore` in `recordStats` job handler in `src/utils/db-queue.ts`
    - In the `case 'recordStats'` handler, after the `prisma.player.update` call, add:
      ```typescript
      if (data.rareFinds > 0) {
        const { refreshPowerScore } = await import('../systems/leaderboard.js');
        await refreshPowerScore(prismaRef, data.playerId);
      }
      ```
    - No changes to `src/systems/leaderboard.ts` — `refreshPowerScore` already reads current fields and writes computed score
    - _Bug_Condition: isBugCondition_P2(X) where X.powerScoreIsStale = true AND X.staleSinceLastRareFindIncrement = true_
    - _Expected_Behavior: stored powerScore updated in same job execution as totalRareFinds increment_
    - _Preservation: leaderboard ranking uses same formula (level × 150 + totalXP × 0.05 + totalRareFinds × 80); powerScore not called when rareFinds = 0_
    - _Requirements: 2.16, 2.17, 3.12_

  - [x] 9.2 Unit test: `refreshPowerScore` called conditionally on `rareFinds`
    - Mock `refreshPowerScore` and run the `recordStats` job handler with `rareFinds = 1`
    - Assert `refreshPowerScore` was called once
    - Run with `rareFinds = 0`; assert `refreshPowerScore` was NOT called
    - _Requirements: 2.16, 2.17_

- [x] 10. P3 — Cap `usedLines[]` at `TAME_USED_LINES_MAX` in tame session

  - [x] 10.1 Add `TAME_USED_LINES_MAX` constant to `src/config.ts`
    - Add `export const TAME_USED_LINES_MAX = 50;`
    - _Requirements: 2.18, 2.19_

  - [x] 10.2 Add shift guard before `updateTameSession` in `src/systems/tame-session.ts`
    - Import `TAME_USED_LINES_MAX` from `'../config'`
    - In every location where a line is pushed to `state.usedLines` before calling `updateTameSession`, add:
      ```typescript
      state.usedLines.push(newLine);
      if (state.usedLines.length > TAME_USED_LINES_MAX) {
        state.usedLines.shift(); // evict oldest entry
      }
      await updateTameSession(redis, state);
      ```
    - _Bug_Condition: isBugCondition_P3(X) where length(X.usedLines) > TAME_USED_LINES_MAX_
    - _Expected_Behavior: usedLines.length always ≤ TAME_USED_LINES_MAX; oldest entry evicted when cap reached_
    - _Preservation: sessions below cap append lines exactly as before; dialogue behaviour unchanged_
    - _Requirements: 2.18, 2.19, 3.13_

  - [x] 10.3 Unit test: eviction at cap boundary
    - Simulate 51 `addUsedLine` calls; assert `usedLines.length = 50`
    - Assert the first entry in the array is the second line added (oldest evicted)
    - Assert the last entry is the 51st line added
    - _Requirements: 2.18, 2.19_

  - [x] 10.4 Verify bug condition exploration test (Property 1) now passes for P3
    - **Property 1: Expected Behavior** - usedLines Capped at TAME_USED_LINES_MAX
    - **IMPORTANT**: Re-run the SAME P3 test from task 1 — do NOT write a new test
    - The test from task 1 asserts `usedLines.length > 50` after 60 turns; on fixed code this should now FAIL (i.e., length stays at 50)
    - **EXPECTED OUTCOME**: Test PASSES (length = 50 after 60 turns, confirming cap is enforced)
    - _Requirements: 2.18, 2.19_

  - [x] 10.5 Verify P3 preservation tests still pass
    - **Property 2: Preservation** - usedLines Below Cap Unchanged
    - **IMPORTANT**: Re-run the SAME P3 preservation test from task 2 — do NOT write a new test
    - **EXPECTED OUTCOME**: Tests PASS (sessions below cap append lines exactly as before)

---

## Integration Tests

- [x] 11. Integration tests for all fixes

  - [x] 11.1 S1 integration test — concurrent financial operations
    - Start the bot with a test guild
    - Send `owl hunt` and `owl bj 100` simultaneously for the same player
    - Assert final coin balance is consistent (no negative balance, no double-deduction)
    - Assert both operations completed (one serialised after the other)
    - _Requirements: 2.1, 2.2_

  - [x] 11.2 A2 integration test — duel daily cap end-to-end
    - Send `owl duel` 10 times in rapid succession for the same player
    - Assert total coins awarded ≤ `DUEL_DAILY_COIN_CAP` (500)
    - Assert XP was awarded for all 10 duels (XP not capped)
    - _Requirements: 2.7, 2.8_

  - [x] 11.3 A4 integration test — XP cap at high level
    - Create a level-50 player in the test environment
    - Run `owl hunt`; assert XP gained ≤ `baseXP × XP_SCALE_MAX_MULT`
    - _Requirements: 2.11, 2.12_

  - [x] 11.4 P3 integration test — tame session payload size
    - Start a tame session and simulate 60 button interactions
    - Assert the Redis payload size does not grow after the 50th interaction
    - Assert `usedLines.length = 50` throughout turns 51–60
    - _Requirements: 2.18, 2.19_

---

## Checkpoint

- [x] 12. Checkpoint — Ensure all tests pass
  - Run the full test suite and confirm all unit, property-based, and integration tests pass
  - Confirm no regressions in non-financial `withLock` paths (repair, maintenance, autosink, tame)
  - Confirm leaderboard rankings are consistent before and after the power score fix (P2)
  - Confirm Redis AOF is active in the deployment environment (A3)
  - Ask the user if any questions arise before closing the spec
