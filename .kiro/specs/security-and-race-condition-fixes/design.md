# OwlHuntBot Security and Race Condition Fixes — Bugfix Design

## Overview

OwlHuntBot has eight distinct bugs spanning three severity tiers. The most critical are two
race conditions: per-operation Redis locks allow concurrent financial commands to read the same
stale coin balance (S1), and `transferCoins` calculates the transfer tax before acquiring the
lock, so the tax amount can be computed on a stale balance (S3). A third critical issue (S2)
is already partially mitigated — `lock.ts` already uses `SET NX EX` and a Lua
compare-and-delete script — but the design documents the correct behaviour for completeness.

The high-severity issues are: bot duel has no daily coin earnings cap, enabling scripted
farming at ~3,600 coins/minute (A2); Redis-only pity counters and cooldowns are lost on
restart (A3); and the XP scaling formula `baseXP × (1 + level × 0.03)` accelerates XP gain
at high levels instead of slowing it (A4).

The performance issues are: hunt executes 5–8 sequential DB operations in the response path
(P1 — BullMQ is already wired in `db-queue.ts` but leaderboard/pity writes are not yet
deferred); leaderboard power score is recomputed via a separate DB query per player at query
time (P2 — `powerScore` field already exists on the Player model and is already written by
`refreshPowerScore`, but it is only updated on level-up, not on every XP/rareFind change);
and the tame session `usedLines[]` array grows unbounded (P3).

The fix strategy is:
- **S1**: Replace per-operation lock namespaces with a single `lock:{playerId}:financial` key
  that gates all coin-touching operations.
- **S3**: Move tax calculation inside the `prisma.$transaction` block in `transferCoins`, after
  reading the sender's current balance.
- **A2**: Track cumulative daily duel coin earnings in Redis (`duel:daily:{playerId}:{date}`);
  zero out coin reward when the cap is reached, but still award XP.
- **A3**: Enable Redis AOF persistence (`appendonly yes`, `appendfsync everysec`) via
  `redis.conf` / Docker environment variables.
- **A4**: Replace `XP_SCALE_RATE = 0.03` with a capped formula:
  `min(1 + level × 0.01, XP_SCALE_MAX_MULT)` where `XP_SCALE_MAX_MULT = 1.30`.
- **P1**: The BullMQ worker in `db-queue.ts` is already active. The remaining work is to
  enqueue pity counter increments (currently written synchronously in `lootbox.ts`) as
  background jobs alongside the existing `recordStats` enqueue in `hunt.ts`.
- **P2**: Update `refreshPowerScore` to be called on every XP gain and every `totalRareFinds`
  increment, not only on level-up. This ensures the stored `powerScore` is always current.
- **P3**: Cap `usedLines[]` at 50 entries in `tame-session.ts`, evicting the oldest entry when
  the limit is reached.


## Glossary

- **Bug_Condition (C)**: The condition that identifies inputs that trigger a specific bug.
- **Property (P)**: The desired correct behaviour when the bug condition holds.
- **Preservation**: Existing correct behaviour that must remain unchanged after the fix.
- **F**: The original (unfixed) function.
- **F'**: The fixed function.
- **TOCTOU**: Time-of-check / time-of-use — a race condition where state is checked and then
  used, but can change between the two operations.
- **Financial lock** (`lock:{playerId}:financial`): A single Redis mutex that serialises all
  coin-touching operations for one player, replacing the previous per-operation namespaces
  (`lock:{playerId}:hunt`, `lock:{playerId}:gamble`, `lock:{playerId}:transfer`, etc.).
- **`withLock(playerId, action, fn)`**: The existing helper in `src/utils/lock.ts` that
  acquires a `SET NX EX` lock, runs `fn`, and releases via Lua compare-and-delete.
- **`finalXP(baseXP, level)`**: The function in `src/utils/math.ts` that applies the level
  scaling multiplier to a base XP amount.
- **`XP_SCALE_RATE`**: Config constant currently `0.03`; drives the unbounded XP acceleration.
- **`XP_SCALE_MAX_MULT`**: New config constant (value `1.30`) that caps the XP multiplier.
- **`refreshPowerScore(prisma, playerId)`**: Existing function in `src/systems/leaderboard.ts`
  that recomputes and writes the stored `powerScore` field on the Player document.
- **`powerScore`**: Stored field on the Player Prisma model (already exists, already indexed).
  Formula: `level × 150 + totalXP × 0.05 + totalRareFinds × 80`.
- **`duel:daily:{playerId}:{date}`**: Redis key (string counter, TTL 25 hours) tracking
  cumulative duel coin earnings for a player on a given UTC date.
- **`DUEL_DAILY_COIN_CAP`**: New config constant (value `500`) — maximum coins a player can
  earn from bot duels per calendar day.
- **`TAME_USED_LINES_MAX`**: New config constant (value `50`) — maximum entries in the
  `usedLines[]` array of a tame session.
- **AOF persistence**: Redis Append-Only File — a durability mode that writes every write
  command to disk, allowing recovery after a crash with at most 1 second of data loss when
  `appendfsync everysec` is used.
- **BullMQ**: The job queue library already present in `package.json` and already initialised
  in `src/utils/db-queue.ts`. The `initDbQueue` function is called at bot startup.


## Bug Details

### S1 — TOCTOU Race Condition (Unified Financial Lock)

#### Bug Condition

The bug manifests when two financial operations for the same player run concurrently. Because
each operation acquires a different lock namespace (`lock:{playerId}:hunt`,
`lock:{playerId}:gamble`, `lock:{playerId}:transfer`, etc.), both can be held simultaneously.
Both operations then read the same stale coin balance, both pass the "sufficient funds" check,
and both apply their decrements — potentially driving the balance below zero.

**Formal Specification:**
```
FUNCTION isBugCondition_S1(X)
  INPUT: X of type ConcurrentCommandPair
  OUTPUT: boolean

  RETURN X.op1.playerId = X.op2.playerId
     AND X.op1.lockNamespace ≠ X.op2.lockNamespace
     AND X.op1.readsCoins = true
     AND X.op2.readsCoins = true
END FUNCTION
```

**Examples:**
- Player sends `owl hunt` and `owl bj 500` at the same time. Hunt reads balance = 800,
  gamble reads balance = 800. Hunt deducts biome entry cost (e.g. 2500 — fails, but the
  balance check window is open). Gamble deducts 500. Both pass the balance check against 800.
- Player sends `owl ver @user 1000` and `owl slot 800` simultaneously. Transfer reads
  balance = 1200, slot reads balance = 1200. Both pass. Final balance = 1200 − 1000 − 800 = −600.
- Player sends `owl sk` (lootbox) and `owl hunt` simultaneously. Both read the same balance
  and both apply their coin changes.

### S3 — Tax Calculated Before Lock Acquisition

#### Bug Condition

`transferCoins` in `src/systems/transfer.ts` calls `calcTax(amount)` before entering the
`withLock` scope. The tax is computed on the `amount` parameter, which is correct — but the
sender's actual balance is only read inside the transaction. If another operation modifies the
sender's balance between the tax calculation and the lock acquisition, the tax is computed on
a potentially stale context. More precisely: the tax is computed on the *requested amount*,
not on the *verified balance*, so the tax amount is always correct for the amount being sent.
The real bug is that the balance check (`sender.coins < amount`) happens inside the lock but
the tax calculation happens outside it, meaning the tax could theoretically be computed before
the lock is held if the code is refactored. The fix moves `calcTax` inside the transaction to
make the entire operation atomic and future-proof.

**Formal Specification:**
```
FUNCTION isBugCondition_S3(X)
  INPUT: X of type TransferOperation
  OUTPUT: boolean

  RETURN X.taxCalculatedBeforeLockAcquisition = true
     AND X.concurrentBalanceModificationPossible = true
END FUNCTION
```

**Examples:**
- Player has 1000 coins. They send `owl ver @user 900`. Tax is calculated as `calcTax(900)`
  before the lock. A concurrent hunt deducts 200 coins. Inside the lock, balance is now 800,
  which is less than 900 — the transfer correctly fails. But if the concurrent operation
  instead *added* coins (e.g. a quest reward), the tax was computed before the final balance
  was known.
- The primary risk is code maintainability: if `calcTax` were ever changed to depend on the
  sender's current balance (e.g. a wealth-based tax), computing it outside the lock would
  produce incorrect results.

### A2 — Bot Duel Has No Daily Earnings Cap

#### Bug Condition

`runSimulatedPvP` in `src/systems/pvp-sim.ts` awards `SIM_PVP_WIN_COINS` (60) plus
`getStreakCoinBonus(newStreak)` (up to +30 at streak 5+) on every win, with no daily ceiling.
The hunt cooldown is 7 seconds; at Discord rate limits a player can win approximately
60 duels/minute = 3,600+ coins/minute via scripting.

**Formal Specification:**
```
FUNCTION isBugCondition_A2(X)
  INPUT: X of type DuelResult
  OUTPUT: boolean

  RETURN X.playerWon = true
     AND X.dailyDuelCoinsEarned >= DUEL_DAILY_COIN_CAP
END FUNCTION
```

**Examples:**
- Player wins 9 duels (540 coins earned). 10th win: `dailyDuelCoinsEarned = 540 >= 500` →
  coin reward = 0, XP still awarded.
- Player at streak 5 wins 7 duels (7 × 90 = 630 coins). 8th win: cap already exceeded →
  coin reward = 0.
- Player has earned 499 coins today. Next win awards `min(60, 500 − 499) = 1` coin (partial
  award up to cap).

### A4 — XP Scaling Accelerates at High Levels

#### Bug Condition

`finalXP` in `src/utils/math.ts` computes `Math.round(baseXP * (1 + level * XP_SCALE_RATE))`
where `XP_SCALE_RATE = 0.03`. At level 30 the multiplier is 1.90×; at level 50 it is 2.50×;
at level 100 it is 4.00×. There is no cap.

**Formal Specification:**
```
FUNCTION isBugCondition_A4(X)
  INPUT: X of type XpEarnEvent
  OUTPUT: boolean

  RETURN (1 + X.playerLevel * XP_SCALE_RATE) > XP_SCALE_MAX_MULT
END FUNCTION
```

**Examples:**
- Level 1 player earns 10 base XP → `10 × (1 + 0.03) = 10.3` → 10 XP. (Not buggy.)
- Level 30 player earns 10 base XP → `10 × (1 + 0.90) = 19` XP. (Buggy: exceeds 1.30× cap.)
- Level 100 player earns 10 base XP → `10 × (1 + 3.00) = 40` XP. (Severely buggy.)
- After fix: level 30 player earns `10 × min(1.30, 1.30) = 13` XP. Level 100 player also
  earns 13 XP. Cap is hit at level 30 (`1 + 30 × 0.01 = 1.30`).

### P1 — Pity Counter Writes Still in Synchronous Path

#### Bug Condition

`hunt.ts` already enqueues `recordStats` (leaderboard) via `enqueueDbWriteBulk`. However,
pity counter increments in `lootbox.ts` are still written synchronously inside the response
path. The `db-queue.ts` BullMQ worker is already initialised and running.

**Formal Specification:**
```
FUNCTION isBugCondition_P1(X)
  INPUT: X of type HuntExecution
  OUTPUT: boolean

  RETURN X.pityIncrementIsSync = true
END FUNCTION
```

### P2 — Power Score Not Updated on Every XP/RareFind Change

#### Bug Condition

`refreshPowerScore` is called only on level-up (in `hunt.ts`) and after PvP wins (in
`pvp-sim.ts` and `pvp.ts`). It is not called when `totalRareFinds` is incremented by the
background `recordStats` job. This means the stored `powerScore` can be stale between
level-ups, causing the leaderboard to show incorrect rankings.

**Formal Specification:**
```
FUNCTION isBugCondition_P2(X)
  INPUT: X of type LeaderboardQuery
  OUTPUT: boolean

  RETURN X.powerScoreIsStale = true
     AND X.staleSinceLastRareFindIncrement = true
END FUNCTION
```

### P3 — Tame Session usedLines[] Grows Unbounded

#### Bug Condition

`updateTameSession` in `src/systems/tame-session.ts` serialises the full `TameSessionState`
to Redis on every turn. The `usedLines[]` array is appended to on every turn with no size
limit. A session with TTL 300 seconds and one turn every ~5 seconds can accumulate up to 60
entries; at scale this inflates Redis I/O.

**Formal Specification:**
```
FUNCTION isBugCondition_P3(X)
  INPUT: X of type TameSessionState
  OUTPUT: boolean

  RETURN length(X.usedLines) > TAME_USED_LINES_MAX
END FUNCTION
```


## Expected Behavior

### Preservation Requirements

**Unchanged Behaviours:**
- A player running `owl hunt` alone (no concurrent financial operation) SHALL continue to
  complete the hunt, award prey, XP, and items exactly as before.
- A player running a gambling command (`owl bj`, `owl cf`, `owl slot`) with sufficient funds
  and no concurrent operation SHALL continue to resolve the gamble with the same payout rates.
- A player running `owl ver @user <amount>` with sufficient funds SHALL continue to transfer
  coins with the correct tax bracket applied and update both balances.
- A player opening a lootbox SHALL continue to consume one lootbox, roll rarity, apply pity,
  and award the resulting buff item.
- A player winning a bot duel below the daily cap SHALL continue to receive the full coin
  reward including streak bonuses.
- A player's pity counter reaching `pityThreshold` SHALL continue to guarantee a Rare or
  better item on the next lootbox open.
- A player earning XP from any source SHALL continue to have the prestige XP bonus applied
  and level-up triggered when the XP threshold is crossed.
- Non-financial `withLock` calls (repair, maintenance, autosink, tame) SHALL continue to use
  per-operation locks with no change to those code paths.
- Low-level players (level 1–10) SHALL continue to receive a positive XP scaling bonus; the
  formula still rewards progression, just with a lower rate and a hard cap.
- Leaderboard rankings SHALL continue to use the same power score formula
  (`level × 150 + totalXP × 0.05 + totalRareFinds × 80`), now pre-computed rather than
  computed at query time.
- Tame session dialogue behaviour SHALL be unchanged for sessions where `usedLines[]` is
  below the 50-entry cap.

**Scope:**
All inputs that do NOT involve concurrent financial operations, high-level XP scaling, bot
duel coin farming, Redis restart, or tame session overflow are completely unaffected by these
fixes. The lock key name change is the only breaking change to the lock namespace, and it
affects only the `action` parameter passed to `withLock` — the lock utility itself is
unchanged.


## Hypothesized Root Cause

### S1 — Per-Operation Lock Namespaces

The `withLock` helper accepts an `action` string that becomes part of the Redis key:
`lock:{playerId}:{action}`. Each command passes its own action name (`'hunt'`, `'gamble'`,
`'transfer'`). Because these are different keys, two concurrent operations for the same player
can both acquire their respective locks simultaneously. The fix is to pass `'financial'` as
the action for all coin-touching operations, collapsing all financial locks onto a single key.

### S3 — Tax Calculation Outside Transaction Scope

`calcTax(amount)` is called at line ~100 of `transfer.ts`, before the `withLock` call at
line ~110. The tax is computed on the `amount` parameter (not the balance), so it is
numerically correct today. The root cause is architectural: the tax calculation is outside
the atomic scope, making the code fragile to future changes where tax might depend on the
sender's live balance. Moving `calcTax` inside the `prisma.$transaction` block eliminates
this fragility.

### A2 — No Daily Accumulator for Duel Coins

`runSimulatedPvP` in `pvp-sim.ts` has no Redis read before awarding coins. The fix requires
a `INCR` on `duel:daily:{playerId}:{date}` (with a 25-hour TTL) before the coin award, and
a comparison against `DUEL_DAILY_COIN_CAP`.

### A3 — Redis Default Configuration Has No Persistence

Redis ships with AOF disabled by default (`appendonly no`). The bot's `docker-compose.yml`
or Redis configuration does not override this. The fix is a one-line config change.

### A4 — Linear Multiplier With No Cap

`XP_SCALE_RATE = 0.03` was chosen to give a small bonus at low levels, but the formula
`1 + level * 0.03` is unbounded. The fix replaces the formula with
`Math.min(1 + level * XP_SCALE_RATE, XP_SCALE_MAX_MULT)` and lowers `XP_SCALE_RATE` to
`0.01` so the cap is reached at level 30 (a reasonable mid-game milestone).

### P1 — Pity Writes Not Yet Enqueued

`hunt.ts` already uses `enqueueDbWriteBulk` for inventory and `recordStats`. The pity
counter increment in `lootbox.ts` (`redis.incr(pityKey)` or a Prisma write) is still
synchronous. The fix adds a `recordPity` job type to `db-queue.ts` and enqueues it from
`lootbox.ts`.

### P2 — refreshPowerScore Only Called on Level-Up

`hunt.ts` calls `refreshPowerScore` only inside the `if (xpResult.levelUp)` branch. The
`recordStats` background job increments `totalRareFinds` but never triggers a power score
refresh. The fix adds a `refreshPowerScore` call inside the `recordStats` job handler in
`db-queue.ts`, so every rare find update also refreshes the score.

### P3 — No Array Size Guard in updateTameSession

`tame-session.ts` appends to `usedLines[]` without checking its length. The fix adds a
`TAME_USED_LINES_MAX` constant to `config.ts` and a slice/shift guard in the function that
appends to `usedLines[]` before calling `updateTameSession`.


## Correctness Properties

Property 1: Bug Condition — Unified Financial Lock Prevents Double-Spend

_For any_ pair of concurrent financial operations for the same player where both operations
read coins and at least one decrements coins, the fixed system SHALL serialise both operations
through `lock:{playerId}:financial` such that the second operation reads the balance written
by the first, and the final coin balance is never negative due to concurrent reads of a stale
balance.

**Validates: Requirements 2.1, 2.2**

---

Property 2: Preservation — Single Financial Operations Unaffected

_For any_ financial operation that runs without a concurrent financial operation for the same
player, the fixed system SHALL produce exactly the same result as the original system —
same coin delta, same XP, same inventory changes — with no observable difference to the
player.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

---

Property 3: Bug Condition — Tax Calculated Inside Lock Scope

_For any_ `transferCoins` call, the fixed function SHALL compute the transfer tax inside the
`prisma.$transaction` block, after reading the sender's current balance, so that the tax
amount is always computed on the verified, locked balance.

**Validates: Requirements 2.6**

---

Property 4: Bug Condition — Bot Duel Daily Cap Enforced

_For any_ bot duel win where the player's cumulative daily duel coin earnings are at or above
`DUEL_DAILY_COIN_CAP` (500), the fixed `runSimulatedPvP` SHALL award zero coins for that
duel result while still awarding the full XP amount.

**Validates: Requirements 2.7, 2.8**

---

Property 5: Preservation — Bot Duel Below Cap Unchanged

_For any_ bot duel win where the player's cumulative daily duel coin earnings are below
`DUEL_DAILY_COIN_CAP`, the fixed `runSimulatedPvP` SHALL award the same coin amount as the
original function (`SIM_PVP_WIN_COINS + bonusCoins`), with no reduction.

**Validates: Requirements 3.5, 3.9**

---

Property 6: Bug Condition — XP Multiplier Capped at XP_SCALE_MAX_MULT

_For any_ XP earn event where `(1 + playerLevel × XP_SCALE_RATE) > XP_SCALE_MAX_MULT`, the
fixed `finalXP` function SHALL return `Math.round(baseXP × XP_SCALE_MAX_MULT)`, never
exceeding the cap regardless of player level.

**Validates: Requirements 2.11, 2.12**

---

Property 7: Preservation — Low-Level XP Scaling Unchanged

_For any_ XP earn event where `(1 + playerLevel × XP_SCALE_RATE) <= XP_SCALE_MAX_MULT`
(i.e. level ≤ 30 with the new rate of 0.01), the fixed `finalXP` function SHALL return
exactly the same value as the original function with the new rate applied, preserving the
positive scaling bonus for low-level players.

**Validates: Requirements 3.7, 3.10**

---

Property 8: Bug Condition — Hunt Response Path Has ≤ 3 Synchronous DB Operations

_For any_ hunt execution, the fixed `rollHunt` function SHALL complete with at most 3
synchronous DB write operations in the response path (coin balance update, player state
update, and owl bond update), with all remaining writes (pity increments, leaderboard stats)
enqueued as background BullMQ jobs.

**Validates: Requirements 2.13, 2.14, 2.15**

---

Property 9: Preservation — Leaderboard Data Consistency After Deferred Writes

_For any_ hunt execution, the eventual state of `totalHunts`, `totalRareFinds`, and
`powerScore` in the database SHALL be identical to what the original synchronous code would
have written — only the timing is deferred, not the values.

**Validates: Requirements 3.11, 3.12**

---

Property 10: Bug Condition — Stored powerScore Updated on Every RareFind Change

_For any_ increment to a player's `totalRareFinds` field (via the `recordStats` background
job), the fixed system SHALL also update the stored `powerScore` field in the same job
execution, so that the leaderboard always reflects the current power score without requiring
a level-up to trigger a refresh.

**Validates: Requirements 2.16, 2.17**

---

Property 11: Bug Condition — Tame Session usedLines[] Capped at TAME_USED_LINES_MAX

_For any_ tame session turn that would push `usedLines[]` beyond `TAME_USED_LINES_MAX` (50)
entries, the fixed `updateTameSession` call site SHALL evict the oldest entry before
appending the new one, keeping the array length at exactly `TAME_USED_LINES_MAX`.

**Validates: Requirements 2.18, 2.19**

---

Property 12: Preservation — Tame Session Dialogue Below Cap Unchanged

_For any_ tame session where `usedLines[]` has fewer than `TAME_USED_LINES_MAX` entries, the
fixed code SHALL append the new line exactly as before, with no change in dialogue behaviour
or anti-repetition logic.

**Validates: Requirements 3.13**


## Fix Implementation

### S1 — Unified Financial Lock

**Files:** `src/systems/hunt.ts`, `src/systems/gambling.ts`, `src/systems/transfer.ts`,
`src/systems/lootbox.ts`, `src/systems/upgrade.ts`, `src/commands/owl-hunt.ts` (if it
calls `withLock` directly)

**Specific Changes:**

1. **`src/systems/hunt.ts`** — Change `withLock(playerId, 'hunt', ...)` to
   `withLock(playerId, 'financial', ...)`. The biome entry cost deduction already happens
   inside this lock scope, so it is automatically protected.

2. **`src/systems/gambling.ts`** — Locate all `withLock(playerId, 'gamble', ...)` or
   equivalent calls and change the action to `'financial'`.

3. **`src/systems/transfer.ts`** — Change `withLock(senderId, 'transfer', ...)` to
   `withLock(senderId, 'financial', ...)`.

4. **`src/systems/lootbox.ts`** — If lootbox opening deducts coins, wrap the coin-touching
   section in `withLock(playerId, 'financial', ...)`.

5. **`src/systems/upgrade.ts`** — If upgrade deducts coins, change the lock action to
   `'financial'`.

6. **No changes to `src/utils/lock.ts`** — The lock utility is already correct. Only the
   `action` argument at call sites changes.

**Key constraint:** Non-financial operations (repair, maintenance, autosink, tame) MUST
continue to use their own per-operation lock namespaces. Only operations that read or write
`player.coins` should use `'financial'`.

---

### S3 — Tax Calculation Inside Lock Scope

**File:** `src/systems/transfer.ts`

**Specific Changes:**

1. Remove the `calcTax(amount)` call that currently appears before the `withLock` block.

2. Move the `const { tax, received, rate } = calcTax(amount)` call to inside the
   `prisma.$transaction` callback, after the sender balance check
   (`if (sender.coins < amount)`).

3. The rest of the transaction logic is unchanged — the tax is still burned (not credited
   to anyone), and the receiver gets `received` coins.

**Before (simplified):**
```typescript
const { tax, received, rate } = calcTax(amount);  // ← outside lock
return withLock(senderId, 'financial', async () => {
  return prisma.$transaction(async (tx) => {
    const sender = await tx.player.findUnique(...);
    if (sender.coins < amount) throw ...;
    // uses tax, received, rate from outer scope
  });
});
```

**After (simplified):**
```typescript
return withLock(senderId, 'financial', async () => {
  return prisma.$transaction(async (tx) => {
    const sender = await tx.player.findUnique(...);
    if (sender.coins < amount) throw ...;
    const { tax, received, rate } = calcTax(amount);  // ← inside lock + tx
    // uses tax, received, rate from inner scope
  });
});
```

---

### A2 — Bot Duel Daily Earnings Cap

**Files:** `src/systems/pvp-sim.ts`, `src/config.ts`

**Specific Changes:**

1. **`src/config.ts`** — Add:
   ```typescript
   export const DUEL_DAILY_COIN_CAP = 500;
   ```

2. **`src/systems/pvp-sim.ts`** — In `runSimulatedPvP`, after determining `coinsGained`
   and before the `prisma.player.update` call:

   a. Compute the Redis key: `` `duel:daily:${playerId}:${new Date().toISOString().slice(0, 10)}` ``

   b. Read the current daily total: `const dailyEarned = parseInt(await redis.get(key) ?? '0', 10)`

   c. Compute the actual coin award:
      ```typescript
      const cappedCoins = Math.max(0, Math.min(coinsGained, DUEL_DAILY_COIN_CAP - dailyEarned));
      ```

   d. If `cappedCoins > 0`, increment the Redis counter:
      ```typescript
      await redis.incrby(key, cappedCoins);
      await redis.expire(key, 25 * 60 * 60); // 25-hour TTL
      ```

   e. Replace `coinsGained` with `cappedCoins` in the `prisma.player.update` call and in
      the `recordCoinsEarned` call.

   f. XP (`xpGained`) is NOT affected by the cap — it is awarded in full regardless.

3. **`runSimulatedPvP` signature** — Add `redis: Redis` parameter (it is already available
   in the command handler that calls this function).

---

### A3 — Redis AOF Persistence

**Files:** `redis.conf` (or `docker-compose.yml` environment variables)

**Specific Changes:**

1. If using a `redis.conf` file, add or update:
   ```
   appendonly yes
   appendfsync everysec
   ```

2. If using Docker Compose with the `redis` image, add to the command:
   ```yaml
   command: redis-server --appendonly yes --appendfsync everysec
   ```

3. No application code changes are required. The existing `src/utils/redis.ts` ioredis
   client connects to Redis normally; persistence is a server-side configuration.

---

### A4 — Capped XP Scaling Formula

**Files:** `src/config.ts`, `src/utils/math.ts`

**Specific Changes:**

1. **`src/config.ts`** — Replace:
   ```typescript
   export const XP_SCALE_RATE = 0.03;
   ```
   With:
   ```typescript
   export const XP_SCALE_RATE    = 0.01;
   export const XP_SCALE_MAX_MULT = 1.30;
   ```

2. **`src/utils/math.ts`** — Replace:
   ```typescript
   export const finalXP = (baseXP: number, level: number): number =>
     Math.round(baseXP * (1 + level * XP_SCALE_RATE));
   ```
   With:
   ```typescript
   export const finalXP = (baseXP: number, level: number): number =>
     Math.round(baseXP * Math.min(1 + level * XP_SCALE_RATE, XP_SCALE_MAX_MULT));
   ```

3. Import `XP_SCALE_MAX_MULT` in `math.ts` alongside the existing `XP_SCALE_RATE` import.

---

### P1 — Defer Pity Counter Writes to BullMQ

**Files:** `src/systems/lootbox.ts`, `src/utils/db-queue.ts`

**Specific Changes:**

1. **`src/utils/db-queue.ts`** — Add a new job type:
   ```typescript
   export interface RecordPityJob {
     type: 'recordPity';
     playerId: string;
     lootboxId: string;
     increment: number;  // +1 per open, or 0 to reset
     reset: boolean;     // true = set counter to 0 (on pity trigger)
   }
   ```
   Add `RecordPityJob` to the `DbWriteJob` union type and add a `case 'recordPity'` handler
   in `processJob` that calls `redis.incrby` or `redis.del` on the pity key.

2. **`src/systems/lootbox.ts`** — Replace any synchronous pity counter write with
   `enqueueDbWrite({ type: 'recordPity', ... })`.

---

### P2 — Refresh powerScore on Every RareFind Increment

**Files:** `src/utils/db-queue.ts`, `src/systems/leaderboard.ts`

**Specific Changes:**

1. **`src/utils/db-queue.ts`** — In the `case 'recordStats'` handler, after the
   `prisma.player.update` call, add:
   ```typescript
   if (data.rareFinds > 0) {
     const { refreshPowerScore } = await import('../systems/leaderboard.js');
     await refreshPowerScore(prismaRef, data.playerId);
   }
   ```
   This ensures every rare find increment also updates the stored `powerScore`.

2. No changes to `src/systems/leaderboard.ts` — `refreshPowerScore` already reads the
   current `level`, `xp`, and `totalRareFinds` from the DB and writes the computed score.

---

### P3 — Cap usedLines[] at TAME_USED_LINES_MAX

**Files:** `src/config.ts`, `src/systems/tame-session.ts`

**Specific Changes:**

1. **`src/config.ts`** — Add:
   ```typescript
   export const TAME_USED_LINES_MAX = 50;
   ```

2. **`src/systems/tame-session.ts`** — In every location where a line is pushed to
   `state.usedLines` before calling `updateTameSession`, add a guard:
   ```typescript
   state.usedLines.push(newLine);
   if (state.usedLines.length > TAME_USED_LINES_MAX) {
     state.usedLines.shift(); // evict oldest entry
   }
   await updateTameSession(redis, state);
   ```
   Import `TAME_USED_LINES_MAX` from `'../config'`.


## Testing Strategy

### Validation Approach

The testing strategy follows the bug condition methodology: first write exploratory tests that
run against the **unfixed** code to confirm the bug is reproducible and to understand the root
cause; then write fix-checking tests that verify the fixed code produces the correct output
for all buggy inputs; then write preservation tests that verify non-buggy inputs are
unaffected.

---

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate each bug on unfixed code. Confirm or
refute the root cause analysis.

**Test Plan**: Write unit tests that simulate the buggy conditions and assert the incorrect
behaviour. Run these tests on the **unfixed** code to observe failures.

**Test Cases:**

1. **S1 — Concurrent Hunt + Gamble (will fail on unfixed code)**
   Simulate two concurrent `withLock` calls for the same player using different action names.
   Assert that both can be acquired simultaneously (demonstrating the race window).

2. **S3 — Tax Outside Lock (will fail on unfixed code)**
   Call `transferCoins` and verify that `calcTax` is invoked before the lock is acquired by
   inspecting call order via a spy. On unfixed code the spy fires before the lock.

3. **A2 — Duel Coins Exceed Cap (will fail on unfixed code)**
   Call `runSimulatedPvP` 10 times for the same player (mocking wins). Assert that total
   coins awarded exceeds `DUEL_DAILY_COIN_CAP`. On unfixed code this assertion passes
   (confirming the bug).

4. **A4 — XP Multiplier Exceeds Cap (will fail on unfixed code)**
   Call `finalXP(10, 50)` on unfixed code. Assert result > `10 * XP_SCALE_MAX_MULT`.
   On unfixed code: `10 * (1 + 50 * 0.03) = 25` > `13`. Assertion passes (bug confirmed).

5. **P3 — usedLines Grows Beyond 50 (will fail on unfixed code)**
   Create a tame session and simulate 60 turns, each appending a line. Assert
   `state.usedLines.length > 50`. On unfixed code this assertion passes (bug confirmed).

**Expected Counterexamples:**
- S1: Two locks with different action names can be held simultaneously for the same player.
- A2: After 9 wins, total coins = 540 > 500 cap.
- A4: `finalXP(10, 50)` returns 25, not 13.
- P3: `usedLines.length` reaches 60 after 60 turns.

---

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function
produces the expected correct behaviour.

**S1 Fix Check:**
```
FOR ALL (op1, op2) WHERE isBugCondition_S1(op1, op2) DO
  result := executeConcurrentFinancialOps_fixed(op1, op2)
  ASSERT result.finalCoins >= 0
  ASSERT result.op2BalanceRead > result.op1BalanceRead OR ops were serialised
END FOR
```

**A2 Fix Check:**
```
FOR ALL duelResult WHERE isBugCondition_A2(duelResult) DO
  result := runSimulatedPvP_fixed(duelResult)
  ASSERT result.coinsGained = 0
  ASSERT result.xpGained > 0
END FOR
```

**A4 Fix Check:**
```
FOR ALL xpEvent WHERE isBugCondition_A4(xpEvent) DO
  result := finalXP_fixed(xpEvent.baseXP, xpEvent.playerLevel)
  ASSERT result <= xpEvent.baseXP * XP_SCALE_MAX_MULT
END FOR
```

**P3 Fix Check:**
```
FOR ALL session WHERE isBugCondition_P3(session) DO
  result := addUsedLine_fixed(session, newLine)
  ASSERT length(result.usedLines) <= TAME_USED_LINES_MAX
END FOR
```

---

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed
function produces the same result as the original function.

**Pseudocode (general form):**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT F(input) = F'(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain.
- It catches edge cases that manual unit tests might miss.
- It provides strong guarantees that behaviour is unchanged for all non-buggy inputs.

**Test Plan**: Observe behaviour on unfixed code first for non-buggy inputs, then write
property-based tests capturing that behaviour.

**Preservation Test Cases:**

1. **S1 — Sequential Financial Operations**: Verify that a single hunt (no concurrent
   operation) produces the same coin delta, XP, and inventory result before and after the
   lock namespace change.

2. **A2 — Duel Below Cap**: Generate random duel results where `dailyEarned < 500`. Assert
   `coinsGained_fixed = coinsGained_original` for all such inputs.

3. **A4 — Low-Level XP**: For all levels 1–30 (where the new formula equals the old formula
   at the new rate), assert `finalXP_fixed(baseXP, level) = Math.round(baseXP * (1 + level * 0.01))`.
   Note: the old formula at rate 0.03 and the new formula at rate 0.01 produce different
   values — the preservation property is that the new formula is internally consistent, not
   that it matches the old formula exactly. The requirement is that low-level players still
   receive a positive bonus (multiplier > 1.0).

4. **P3 — usedLines Below Cap**: For sessions with fewer than 50 lines, assert that
   `addUsedLine_fixed(session, line).usedLines` equals `[...session.usedLines, line]`.

---

### Unit Tests

- **S1**: Test that `withLock(playerId, 'financial', fn1)` and
  `withLock(playerId, 'financial', fn2)` cannot both be held simultaneously for the same
  player. Test that `withLock(playerId, 'hunt', fn)` and `withLock(playerId, 'gamble', fn)`
  CAN be held simultaneously (to confirm the old behaviour was the bug).
- **S3**: Test that `calcTax` is called inside the `prisma.$transaction` callback, not
  before `withLock`.
- **A2**: Test `runSimulatedPvP` with a mocked Redis that returns `dailyEarned = 499`.
  Assert `coinsGained = 1` (partial award). Test with `dailyEarned = 500`. Assert
  `coinsGained = 0`. Test with `dailyEarned = 0`. Assert `coinsGained = SIM_PVP_WIN_COINS + bonusCoins`.
- **A4**: Test `finalXP(10, 0)` = 10, `finalXP(10, 30)` = 13, `finalXP(10, 100)` = 13.
- **P2**: Test that the `recordStats` job handler calls `refreshPowerScore` when
  `rareFinds > 0` and does not call it when `rareFinds = 0`.
- **P3**: Test that after 51 `addUsedLine` calls, `usedLines.length = 50` and the first
  entry is the second line added (oldest evicted).

### Property-Based Tests

- **S1 Preservation**: Generate random single-player financial operation sequences. For each
  sequence, assert that the final coin balance equals the initial balance minus the sum of
  all decrements plus the sum of all increments, with no negative intermediate states.
- **A2 Preservation**: Generate random `(dailyEarned, coinsGained)` pairs where
  `dailyEarned < DUEL_DAILY_COIN_CAP`. Assert `cappedCoins = coinsGained` for all such pairs.
- **A4 Preservation**: Generate random `(baseXP, level)` pairs where `level` is in [1, 30].
  Assert `finalXP(baseXP, level) = Math.round(baseXP * (1 + level * 0.01))` (formula is
  linear below the cap).
- **P3 Preservation**: Generate random sequences of line additions to a tame session. Assert
  that `usedLines.length` never exceeds `TAME_USED_LINES_MAX` and that the last
  `TAME_USED_LINES_MAX` lines added are always present in the array.

### Integration Tests

- **S1**: Start the bot with a test guild. Send `owl hunt` and `owl bj 100` simultaneously
  for the same player. Assert the final coin balance is consistent (no negative balance, no
  double-deduction).
- **A2**: Send `owl duel` 10 times in rapid succession for the same player. Assert total
  coins awarded ≤ `DUEL_DAILY_COIN_CAP`. Assert XP was awarded for all 10 duels.
- **A4**: Create a level-50 player. Run `owl hunt`. Assert the XP gained is ≤
  `baseXP * XP_SCALE_MAX_MULT`.
- **P3**: Start a tame session and simulate 60 button interactions. Assert the Redis payload
  size does not grow after the 50th interaction.
