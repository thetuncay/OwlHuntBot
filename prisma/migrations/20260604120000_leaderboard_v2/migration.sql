-- Leaderboard v2: LeaderboardScore, net wealth, unique constraints, indexes

-- Player: net wealth tracking
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "totalCoinsLost" INTEGER NOT NULL DEFAULT 0;

-- LeaderboardScore write-behind table
CREATE TABLE IF NOT EXISTS "LeaderboardScore" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "score" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaderboardScore_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LeaderboardScore_scope_category_period_playerId_key"
ON "LeaderboardScore"("scope", "category", "period", "playerId");

CREATE INDEX IF NOT EXISTS "LeaderboardScore_scope_category_period_score_idx"
ON "LeaderboardScore"("scope", "category", "period", "score" DESC);

ALTER TABLE "LeaderboardScore" DROP CONSTRAINT IF EXISTS "LeaderboardScore_playerId_fkey";
ALTER TABLE "LeaderboardScore" ADD CONSTRAINT "LeaderboardScore_playerId_fkey"
FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DailyQuest duplicate prevention
CREATE UNIQUE INDEX IF NOT EXISTS "DailyQuest_playerId_type_resetAt_key"
ON "DailyQuest"("playerId", "type", "resetAt");

-- SeasonArchive duplicate prevention
CREATE UNIQUE INDEX IF NOT EXISTS "SeasonArchive_playerId_seasonId_key"
ON "SeasonArchive"("playerId", "seasonId");

-- Performance indexes
CREATE INDEX IF NOT EXISTS "Player_pvpCount_idx" ON "Player"("pvpCount");
CREATE INDEX IF NOT EXISTS "SeasonArchive_seasonId_powerScore_idx" ON "SeasonArchive"("seasonId", "powerScore" DESC);
CREATE INDEX IF NOT EXISTS "SeasonArchive_seasonId_totalHunts_idx" ON "SeasonArchive"("seasonId", "totalHunts" DESC);
CREATE INDEX IF NOT EXISTS "SeasonArchive_seasonId_totalRareFinds_idx" ON "SeasonArchive"("seasonId", "totalRareFinds" DESC);
CREATE INDEX IF NOT EXISTS "SeasonArchive_seasonId_totalPvpWins_idx" ON "SeasonArchive"("seasonId", "totalPvpWins" DESC);
CREATE INDEX IF NOT EXISTS "SeasonArchive_seasonId_totalCoinsEarned_idx" ON "SeasonArchive"("seasonId", "totalCoinsEarned" DESC);
