# Requirements Document

## Introduction

OwlHuntBot is a production Discord bot (TypeScript, discord.js v14, Prisma 6, MongoDB Atlas M0, Redis via ioredis, single Node.js process) that experiences significant performance degradation under concurrent load of 20 or more simultaneous users. Root cause analysis has identified six discrete bottlenecks: sequential database reads that could be parallelised, per-item inventory writes that generate N round-trips, animation sequences blocking the critical reply path, a redundant power-score recomputation triggered on every hunt, an under-tuned Prisma connection pool, a missing compound MongoDB index, and sequential Redis calls that could be pipelined.

This spec covers only the targeted performance fixes. It does not alter game logic, balance values, naming conventions, or any system outside the explicitly listed scope.

## Glossary

- **Hunt_Command**: The `/owl hunt` slash-command handler responsible for computing hunt outcomes and replying to the user.
- **PvP_Command**: The `/owl pvp` slash-command handler responsible for computing PvP outcomes and replying to the user.
- **System**: The OwlHuntBot Node.js process as a whole.
- **Player**: A Prisma model representing a Discord user's game profile.
- **Owl**: A Prisma model representing an owl owned by a Player; the main owl has `isMain: true`.
- **PlayerBuff**: A Prisma model representing active buffs applied to a Player.
- **Inventory**: A Prisma model representing item quantities owned by a Player.
- **BulkWrite**: A single MongoDB `bulkWrite` network call that batches multiple write operations.
- **Animation**: The sequence of Discord message edits that display a hunt or PvP result frame-by-frame.
- **refreshPowerScore**: A utility function that recomputes and caches a player's power score.
- **Leaderboard_Command**: The `/owl lb` slash-command handler that displays ranked player scores.
- **Prisma_Client**: The singleton `PrismaClient` instance used for all database access.
- **Connection_Pool**: The Prisma/MongoDB driver pool that manages reusable database connections.
- **Redis_Pipeline**: An ioredis pipeline object that batches multiple Redis commands into a single network round-trip.
- **Cooldown_Checker**: The utility module (`src/utils/cooldown.ts`) that enforces per-user command cooldowns and rate limits.

## Requirements

### Requirement 1: Parallel DB Reads in the Hunt Command

**User Story:** As a bot operator, I want the three independent database reads at the start of every hunt to execute in parallel, so that sequential round-trips do not add unnecessary latency under concurrent load.

#### Acceptance Criteria

1. WHEN a user invokes the Hunt_Command, THE Hunt_Command SHALL fetch the Player record, the main Owl record (`isMain: true`), and all PlayerBuff records for that user simultaneously using a single `Promise.all` call.
2. WHEN the Hunt_Command issues the parallel reads, THE Hunt_Command SHALL NOT await any of the three Prisma calls individually before the others are initiated.
3. WHEN the parallel reads complete, THE Hunt_Command SHALL produce a hunt outcome that is functionally identical to the outcome produced by the previous sequential implementation.

---

### Requirement 2: Bulk Inventory Write

**User Story:** As a bot operator, I want all inventory updates from a single hunt to be written in one database round-trip, so that capturing multiple items does not generate N sequential or parallel network calls.

#### Acceptance Criteria

1. WHEN a hunt produces one or more captured items, THE Hunt_Command SHALL write all inventory changes using a single `prisma.$runCommandRaw` BulkWrite call.
2. WHEN the BulkWrite executes, THE System SHALL apply upsert semantics for each item: inserting a new record if the item does not exist for that player, or incrementing the existing quantity if it does.
3. WHEN the BulkWrite executes, THE System SHALL issue exactly one MongoDB network round-trip for inventory writes regardless of the number of captured items.
4. WHEN a hunt produces zero captured items, THE Hunt_Command SHALL NOT issue any inventory BulkWrite call.

---

### Requirement 3: Animation Decoupled from Critical Reply Path

**User Story:** As a Discord user, I want to receive my hunt or PvP result immediately after the outcome is computed, so that I am not kept waiting while animation frames are being sent.

#### Acceptance Criteria

1. WHEN the Hunt_Command finishes computing its result, THE Hunt_Command SHALL call `interaction.editReply` with the result embed before initiating any animation.
2. WHEN the Hunt_Command initiates the animation sequence, THE Hunt_Command SHALL call `animateHuntMessage` without `await` so that animation runs as a non-blocking background task.
3. WHEN the PvP_Command finishes computing its result, THE PvP_Command SHALL call `interaction.editReply` with the result embed before initiating any animation.
4. WHEN the PvP_Command initiates the animation sequence, THE PvP_Command SHALL call `animatePvPMessage` without `await` so that animation runs as a non-blocking background task.
5. WHEN an animation background task encounters an error (including Discord rate-limit errors), THE System SHALL suppress the error via a `.catch(() => {})` handler attached to the unawaited promise so that the error does not propagate to the command handler.
6. IF the animation background task fails entirely, THE System SHALL preserve the result embed already sent to the user so that the user retains the hunt or PvP outcome.

---

### Requirement 4: Remove Redundant refreshPowerScore from Hunt

**User Story:** As a bot operator, I want power score recomputation removed from the hunt execution path, so that every hunt does not trigger an unnecessary background computation that contends for database resources.

#### Acceptance Criteria

1. WHEN the Hunt_Command completes successfully, THE Hunt_Command SHALL NOT call `refreshPowerScore` at any point during its execution path.
2. WHEN the Leaderboard_Command detects a cache miss, THE Leaderboard_Command SHALL call `refreshPowerScore` to recompute the player's power score.
3. WHEN a user runs the Leaderboard_Command after hunting, THE Leaderboard_Command SHALL display a power score that reflects the player's current state.

---

### Requirement 5: Prisma Connection Pool Tuning

**User Story:** As a bot operator, I want the Prisma connection pool configured with explicit limits, so that the pool does not exhaust MongoDB Atlas M0's connection cap under concurrent load.

#### Acceptance Criteria

1. THE System SHALL configure the Prisma connection pool with `connection_limit=10` and `pool_timeout=10` via the `DATABASE_URL` connection string.
2. WHEN `DATABASE_URL` is defined in `.env.example`, THE `.env.example` file SHALL include `?connection_limit=10&pool_timeout=10` appended to the connection string value.
3. WHEN `DATABASE_URL` is defined in `.env`, THE `.env` file SHALL include `?connection_limit=10&pool_timeout=10` appended to the connection string value.
4. WHEN the connection pool parameters are added, THE System SHALL include an inline comment in `.env.example` explaining that `connection_limit=10` is chosen to stay within the Atlas M0 connection cap and `pool_timeout=10` prevents indefinite queuing under burst load.
5. WHERE `PrismaClient` is instantiated with an explicit `datasources` override, THE Prisma_Client instantiation SHALL also include `connection_limit=10` and `pool_timeout=10` in the overridden connection string.

---

### Requirement 6: MongoDB Index for Main Owl Lookup

**User Story:** As a bot operator, I want a compound index on the Owl collection covering `ownerId` and `isMain`, so that the frequent "find main owl by owner" query does not perform a full collection scan.

#### Acceptance Criteria

1. THE System SHALL define a compound index `@@index([ownerId, isMain])` on the `Owl` model in `prisma/schema.prisma`.
2. WHEN the index is added to the schema, THE System SHALL NOT remove any existing indexes from the `Owl` model or any other model.
3. WHEN the schema change is applied, THE System SHALL propagate the index to the database by running `npx prisma db push` (or the equivalent migration command).

---

### Requirement 7: Redis Pipeline for Cooldown Checks

**User Story:** As a bot operator, I want cooldown and rate-limit Redis reads batched into a single pipeline, so that back-to-back Redis round-trips at the start of each command do not add cumulative latency under concurrent load.

#### Acceptance Criteria

1. WHEN the Cooldown_Checker performs two or more Redis read operations (GET, PTTL, or equivalent) back-to-back at the start of a command, THE Cooldown_Checker SHALL batch those operations into a single `redis.pipeline()` execution.
2. WHEN the pipeline executes, THE Cooldown_Checker SHALL destructure the `exec()` result array to retrieve each key's value in the correct positional order.
3. IF the pipeline `exec()` call returns `null` or an entry in the result array contains an error, THEN THE Cooldown_Checker SHALL handle the failure gracefully without throwing an unhandled exception.
