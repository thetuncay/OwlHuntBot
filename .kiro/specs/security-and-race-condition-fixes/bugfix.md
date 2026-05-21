# Bugfix Requirements Document

## Introduction

OwlHuntBot (BaykusBot) has multiple critical security vulnerabilities, race conditions, and performance bottlenecks identified through a comprehensive architecture audit. The issues span three severity tiers: S-tier (critical, exploitable), A-tier (high, abusable), and P-tier (performance). This document covers the S-tier, A-tier, and P-tier issues.

The core security problem is that the bot's financial operations are not fully atomic. Per-operation Redis locks use different namespaces (`lock:{playerId}:hunt`, `lock:{playerId}:gamble`), meaning a player can run a hunt and a gamble command concurrently — both pass the "sufficient funds" check against the same stale balance. Additionally, the bot duel (`owl duel`) has no daily earnings cap, enabling scripted coin farming at ~3,600 coins/minute. Redis-only state (pity counters, cooldowns) is lost on restart, and the XP scaling formula (`finalXP = baseXP × (1 + level × 0.03)`) accelerates XP gain at high levels instead of slowing it.

The core performance problem is that each `owl hunt` command triggers 5–8 sequential MongoDB operations. At 100 concurrent players on Atlas M0 (max ~100 ops/sec), the bot queue-stalls. Non-critical writes (leaderboard stats, pity counter updates) block the response path unnecessarily. Additionally, the leaderboard power score computation requires O(N) individual player fetches, and the tame session's `usedLines[]` array grows unbounded within a session.

---

## Bug Analysis

### Current Behavior (Defect)

**S1 — Concurrent Hunt + Gambling Double-Spend (TOCTOU Race Condition)**

1.1 WHEN a player sends `owl hunt` and a gambling command (e.g., `owl bj`) at the same time THEN the system acquires two separate locks (`lock:{playerId}:hunt` and `lock:{playerId}:gamble`) and both operations read the same stale coin balance, allowing both to pass the "sufficient funds" check and both to decrement coins from the same starting value

1.2 WHEN two concurrent financial operations both pass the balance check against a stale read THEN the system applies both decrements via `{ decrement: X }` incremental updates, potentially driving the player's coin balance below zero

**S2 — Redis Lock Has No Crash-Safe Expiry**

1.3 WHEN the Node.js process crashes after `SET lock:{playerId}:{action}` is written but before the lock is released THEN the system leaves the lock key in Redis indefinitely, soft-bricking the player's account until manual Redis intervention

1.4 WHEN a lock is held and the TTL expires (currently `LOCK_TTL_SECONDS = 15`) THEN the system releases the lock by TTL expiry, but the Lua compare-and-delete release script may attempt to delete a key that has already been re-acquired by a new operation, causing a silent no-op release

**S3 — transferCoins Performs Two Sequential Writes Without Rollback**

1.5 WHEN `transferCoins` decrements the sender's coins in the first `prisma.player.update` call and the second `prisma.player.update` call (incrementing the receiver's coins) fails THEN the system destroys the sender's coins without crediting the receiver, resulting in permanent coin loss

1.6 WHEN `transferCoins` calculates the transfer tax before acquiring the player-wide financial lock THEN the system may compute the tax on a stale coin amount if another concurrent operation modifies the balance between tax calculation and lock acquisition

**A2 — Bot Duel Has No Daily Earnings Cap**

1.7 WHEN a player repeatedly calls `owl duel` (bot duel) with a 7-second cooldown THEN the system awards 60 coins per win plus streak bonuses (up to +30 coins at streak 5+) with no daily cap, enabling scripted farming of approximately 3,600 coins per minute at Discord rate limits

1.8 WHEN a player maintains a long win streak in bot duels THEN the system continues awarding streak coin bonuses (`PVP_STREAK_COIN_BONUSES`) indefinitely without any daily earnings ceiling

**A3 — Pity Counters and Cooldowns Stored Only in Redis**

1.9 WHEN the Redis instance restarts (OOM kill, crash, or planned restart) THEN the system loses all pity counters (`pity:{playerId}:{lootboxId}`) and all cooldown keys, resetting every player's pity progress to zero and clearing all active cooldowns

1.10 WHEN Redis restarts and all cooldowns are cleared THEN the system allows all players to immediately execute rate-limited commands (hunt, duel, transfer, upgrade) simultaneously, creating a mass concurrent write storm to the database

**A4 — XP Scaling Accelerates at High Levels**

1.11 WHEN a high-level player (e.g., level 30) earns hunt XP THEN the system applies `finalXP = baseXP × (1 + level × 0.03)`, awarding 90% more XP per hunt than a level-1 player, causing high-level players to level up faster rather than slower

1.12 WHEN `XP_SCALE_RATE = 0.03` is applied linearly with level THEN the system produces unbounded XP acceleration — at level 50 the multiplier is 2.5×, at level 100 it is 4.0× — with no cap or diminishing returns

**P1 — Hunt Command Executes 5–8 Sequential DB Operations Per Invocation**

1.13 WHEN a player runs `owl hunt` THEN the system executes addXP + N inventory upserts + player update + leaderboard update + lootbox check + encounter check sequentially in the response path, totalling 5–8 MongoDB operations per command

1.14 WHEN 100 players hunt simultaneously THEN the system issues 500–800 MongoDB operations/second against Atlas M0 (effective limit ~100 ops/sec), causing connection queue stalls and timeout errors for all concurrent players

1.15 WHEN non-critical writes (leaderboard stats, pity counter increments) are executed synchronously in the hunt response path THEN the system adds unnecessary latency to every hunt response even though these writes do not affect the correctness of the hunt result

**P2 — Leaderboard Power Score Requires O(N) Individual Player Fetches**

1.16 WHEN the leaderboard is rendered THEN the system calls `refreshPowerScore` for each player entry, requiring a separate MongoDB query per player to compute `level × 150 + totalXP × 0.05 + totalRareFinds × 80`, making leaderboard generation O(N) in query count

1.17 WHEN the leaderboard cache (TTL 120 seconds) expires and is rebuilt THEN the system issues N sequential player fetches, blocking the leaderboard response for the duration of all N queries

**P3 — Tame Session usedLines[] Array Grows Unbounded**

1.18 WHEN a tame session is active THEN the system appends each used dialogue line to `usedLines[]` in the Redis session key with no maximum size limit, causing the serialized session payload to grow with every turn

1.19 WHEN 100 concurrent tame sessions are active and each has accumulated many turns THEN the system serializes and deserializes increasingly large JSON payloads on every button interaction, increasing Redis I/O and CPU overhead per turn

---

### Expected Behavior (Correct)

**S1 — Unified Financial Lock**

2.1 WHEN a player initiates any financial operation (hunt, gambling, transfer, lootbox, upgrade) THEN the system SHALL acquire a single unified player-wide financial lock (`lock:{playerId}:financial`) before reading the coin balance, ensuring no two financial operations can read the same stale balance concurrently

2.2 WHEN a player's coin balance is decremented by any financial operation THEN the system SHALL verify the balance is sufficient within the same lock scope as the decrement, so that concurrent operations cannot both pass the balance check

**S2 — Atomic Lock Acquisition with TTL**

2.3 WHEN a lock is acquired THEN the system SHALL use `redis.set(key, token, 'EX', TTL, 'NX')` (atomic set-with-expiry) so that a process crash after lock acquisition cannot leave a permanent lock key in Redis

2.4 WHEN a lock TTL expires and a new operation acquires the same lock key THEN the system SHALL use the Lua compare-and-delete script to release only the token that matches, preventing a stale release from evicting a legitimately held lock

**S3 — Atomic Transfer Writes**

2.5 WHEN `transferCoins` executes THEN the system SHALL perform both the sender decrement and receiver increment within a single `prisma.$transaction` block so that a failure in either write rolls back the entire operation and no coins are destroyed

2.6 WHEN `transferCoins` calculates the transfer tax THEN the system SHALL calculate the tax amount inside the financial lock scope, after reading the sender's current balance, so that the tax is always computed on the actual balance at the time of the operation

**A2 — Bot Duel Daily Earnings Cap**

2.7 WHEN a player wins a bot duel THEN the system SHALL track cumulative daily duel coin earnings per player and SHALL NOT award coin rewards once the player's daily duel earnings reach the configured cap (500 coins/day)

2.8 WHEN a player's daily duel coin earnings are at or above the daily cap THEN the system SHALL still allow the duel to proceed and award XP, but SHALL award zero coins for that duel result

**A3 — Redis Persistence for Pity and Cooldowns**

2.9 WHEN the Redis instance is configured THEN the system SHALL enable AOF persistence (`appendonly yes`, `appendfsync everysec`) so that pity counters and cooldown keys survive a Redis restart with at most 1 second of data loss

2.10 WHEN a Redis restart occurs and AOF persistence is enabled THEN the system SHALL restore all pity counters and active cooldown keys from the AOF log, preventing mass cooldown bypass and pity manipulation

**A4 — Capped XP Scaling**

2.11 WHEN a player earns hunt XP THEN the system SHALL apply a level-based XP scaling formula that provides diminishing returns at high levels, such that the XP multiplier increases slowly and is capped (e.g., `min(1 + level × 0.01, 1.30)` — maximum 30% bonus at level 30+)

2.12 WHEN the XP scaling multiplier is applied THEN the system SHALL ensure that the multiplier never exceeds a defined maximum cap (`XP_SCALE_MAX_MULT`), so that high-level players do not level faster than mid-level players

**P1 — Non-Critical Hunt Writes Deferred to Background Queue**

2.13 WHEN a player runs `owl hunt` THEN the system SHALL execute only coin balance update and inventory item grants synchronously in the response path, and SHALL enqueue leaderboard stat updates and pity counter increments as background jobs via BullMQ

2.14 WHEN background hunt jobs are enqueued THEN the system SHALL process them asynchronously within 5 seconds, so that leaderboard and pity data are eventually consistent but the hunt response is returned to the player immediately after the critical writes complete

2.15 WHEN the BullMQ worker processes a deferred hunt job THEN the system SHALL apply the same leaderboard and pity update logic as before, with no change to the final data values — only the timing is deferred

**P2 — Leaderboard Power Score Stored Directly on Player Document**

2.16 WHEN a player's level, totalXP, or totalRareFinds changes THEN the system SHALL update a stored `powerScore` field on the Player document in the same write operation, so that leaderboard queries read a pre-computed value instead of computing it at query time

2.17 WHEN the leaderboard is rendered THEN the system SHALL query players sorted by the stored `powerScore` field in a single MongoDB query, eliminating the O(N) per-player fetch pattern

**P3 — Tame Session usedLines[] Capped at Maximum Size**

2.18 WHEN a dialogue line is added to `usedLines[]` in a tame session THEN the system SHALL enforce a maximum array size of 50 entries, evicting the oldest entry when the limit is reached

2.19 WHEN the tame session is serialized to Redis THEN the system SHALL ensure the JSON payload size does not grow beyond a predictable bound regardless of session duration or turn count

---

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a player runs `owl hunt` without any concurrent financial operation THEN the system SHALL CONTINUE TO complete the hunt, award prey, XP, and items, and update the player's state exactly as before

3.2 WHEN a player runs a gambling command (`owl bj`, `owl cf`, `owl slot`) with sufficient funds and no concurrent operation THEN the system SHALL CONTINUE TO resolve the gamble, apply the win/loss delta, and return the result with the same payout rates

3.3 WHEN a player runs `owl ver @user <amount>` (transfer) with sufficient funds, above the minimum level, and within daily limits THEN the system SHALL CONTINUE TO transfer coins with the correct tax bracket applied and update both sender and receiver balances

3.4 WHEN a player opens a lootbox (`owl sk`, `owl ek`) THEN the system SHALL CONTINUE TO consume one lootbox from inventory, roll rarity using the configured weights, apply pity if the threshold is reached, and award the resulting buff item

3.5 WHEN a player wins a bot duel (`owl duel`) and has not reached the daily coin cap THEN the system SHALL CONTINUE TO award 60 base coins plus applicable streak bonuses, update the PvP streak, and award XP

3.6 WHEN a player's pity counter reaches the configured threshold (`pityThreshold`) THEN the system SHALL CONTINUE TO guarantee a Rare or better item on the next lootbox open

3.7 WHEN a player earns XP from any source (hunt, PvP, tame, quest) THEN the system SHALL CONTINUE TO apply the prestige XP bonus multiplier and trigger level-up if the XP threshold is crossed

3.8 WHEN the lock utility (`withLock`) is called for non-financial operations (repair, maintenance, autosink, tame) THEN the system SHALL CONTINUE TO use per-operation locks as before, with no change to those code paths

3.9 WHEN a player's daily duel coin earnings are below the cap THEN the system SHALL CONTINUE TO award the full coin reward including streak bonuses without any reduction

3.10 WHEN a low-level player (level 1–10) earns hunt XP THEN the system SHALL CONTINUE TO apply a positive XP scaling bonus (the formula still rewards progression, just with a lower cap)

3.11 WHEN a hunt completes and background jobs are enqueued THEN the system SHALL CONTINUE TO update leaderboard stats and pity counters with the same values as before — only the timing changes, not the data

3.12 WHEN the leaderboard is queried THEN the system SHALL CONTINUE TO rank players by power score using the same formula (`level × 150 + totalXP × 0.05 + totalRareFinds × 80`), with the score now pre-computed rather than calculated at query time

3.13 WHEN a tame session is active and `usedLines[]` is below the 50-entry cap THEN the system SHALL CONTINUE TO append lines exactly as before with no change in dialogue behaviour

---

## Bug Condition Pseudocode

### S1 — TOCTOU Race Condition

```pascal
FUNCTION isBugCondition_S1(X)
  INPUT: X of type ConcurrentCommandPair
  OUTPUT: boolean

  // Bug triggers when two financial operations run concurrently for the same player
  RETURN X.op1.playerId = X.op2.playerId
     AND X.op1.lockNamespace ≠ X.op2.lockNamespace
     AND X.op1.readsCoins = true
     AND X.op2.readsCoins = true
END FUNCTION

// Property: Fix Checking — S1
FOR ALL X WHERE isBugCondition_S1(X) DO
  result ← executeFinancialOps'(X)
  ASSERT result.finalCoins >= 0
  ASSERT result.op1.balanceReadTime = result.op2.balanceReadTime → false  // never same stale read
END FOR

// Property: Preservation Checking — S1
FOR ALL X WHERE NOT isBugCondition_S1(X) DO
  ASSERT F(X).finalCoins = F'(X).finalCoins
END FOR
```

### S2 — Lock TTL / Crash Safety

```pascal
FUNCTION isBugCondition_S2(X)
  INPUT: X of type LockAcquisitionEvent
  OUTPUT: boolean

  // Bug triggers when a lock is acquired but the process crashes before release
  RETURN X.lockAcquired = true AND X.processTerminatedBeforeRelease = true
END FUNCTION

// Property: Fix Checking — S2
FOR ALL X WHERE isBugCondition_S2(X) DO
  result ← checkLockAfterCrash'(X)
  ASSERT result.lockKeyExistsInRedis = false OR result.lockTTLRemaining > 0
  // Lock either expired naturally or was never left permanently
END FOR
```

### A2 — Bot Duel Daily Cap

```pascal
FUNCTION isBugCondition_A2(X)
  INPUT: X of type DuelResult
  OUTPUT: boolean

  // Bug triggers when a player wins a duel and has already earned >= cap today
  RETURN X.playerWon = true AND X.dailyDuelCoinsEarned >= DUEL_DAILY_COIN_CAP
END FUNCTION

// Property: Fix Checking — A2
FOR ALL X WHERE isBugCondition_A2(X) DO
  result ← runSimulatedPvP'(X)
  ASSERT result.coinsGained = 0
  ASSERT result.xpGained > 0  // XP still awarded
END FOR

// Property: Preservation Checking — A2
FOR ALL X WHERE NOT isBugCondition_A2(X) DO
  ASSERT F(X).coinsGained = F'(X).coinsGained
END FOR
```

### A4 — XP Scaling Cap

```pascal
FUNCTION isBugCondition_A4(X)
  INPUT: X of type XpEarnEvent
  OUTPUT: boolean

  // Bug triggers when level is high enough that the multiplier exceeds the intended cap
  RETURN (1 + X.playerLevel * XP_SCALE_RATE) > XP_SCALE_MAX_MULT
END FUNCTION

// Property: Fix Checking — A4
FOR ALL X WHERE isBugCondition_A4(X) DO
  result ← finalXP'(X.baseXP, X.playerLevel)
  ASSERT result <= X.baseXP * XP_SCALE_MAX_MULT
END FOR

// Property: Preservation Checking — A4
FOR ALL X WHERE NOT isBugCondition_A4(X) DO
  ASSERT F(X) = F'(X)  // Low-level XP unchanged
END FOR
```

### P1 — Hunt DB Operation Count

```pascal
FUNCTION isBugCondition_P1(X)
  INPUT: X of type HuntExecution
  OUTPUT: boolean

  // Bug triggers when non-critical writes are in the synchronous response path
  RETURN X.leaderboardWriteIsSync = true OR X.pityIncrementIsSync = true
END FUNCTION

// Property: Fix Checking — P1
FOR ALL X WHERE isBugCondition_P1(X) DO
  result ← executeHunt'(X)
  ASSERT result.syncDbOps <= 3          // coins + inventory + player state only
  ASSERT result.backgroundJobEnqueued = true
  ASSERT result.responseTimeMs < result_old.responseTimeMs
END FOR

// Property: Preservation Checking — P1
FOR ALL X DO
  ASSERT eventualLeaderboardStats'(X) = leaderboardStats(X)  // same values, deferred timing
END FOR
```

### P2 — Leaderboard Query Complexity

```pascal
FUNCTION isBugCondition_P2(X)
  INPUT: X of type LeaderboardQuery
  OUTPUT: boolean

  // Bug triggers when power score is computed at query time via N individual fetches
  RETURN X.powerScoreStoredOnDocument = false
END FUNCTION

// Property: Fix Checking — P2
FOR ALL X WHERE isBugCondition_P2(X) DO
  result ← renderLeaderboard'(X)
  ASSERT result.dbQueriesIssued = 1     // single sorted query, no per-player fetches
END FOR

// Property: Preservation Checking — P2
FOR ALL X DO
  ASSERT leaderboardRanking'(X) = leaderboardRanking(X)  // same order, same scores
END FOR
```

### P3 — Tame Session Payload Size

```pascal
FUNCTION isBugCondition_P3(X)
  INPUT: X of type TameSessionState
  OUTPUT: boolean

  // Bug triggers when usedLines array exceeds the cap
  RETURN length(X.usedLines) > TAME_USED_LINES_MAX
END FUNCTION

// Property: Fix Checking — P3
FOR ALL X WHERE isBugCondition_P3(X) DO
  result ← addUsedLine'(X, newLine)
  ASSERT length(result.usedLines) <= TAME_USED_LINES_MAX
END FOR

// Property: Preservation Checking — P3
FOR ALL X WHERE length(X.usedLines) < TAME_USED_LINES_MAX DO
  ASSERT addUsedLine'(X, newLine).usedLines = addUsedLine(X, newLine).usedLines
END FOR
```
