-- Migration: mongodb-to-pg
-- Full PostgreSQL schema for OwlHuntBot
-- Generated from prisma/schema.prisma

-- AlterTable: Add missing columns to Player
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "totalHunts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "totalRareFinds" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "totalPvpWins" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "totalCoinsEarned" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "powerScore" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "totalXP" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "pvpBestStreak" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "noRareStreak" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "dailyLootboxDrops" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "lastLootboxDropDate" TIMESTAMP(3);
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "dailyTransferSent" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "dailyTransferReceived" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "lastTransferDate" TIMESTAMP(3);
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "dailyMarketListings" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "lastMarketListingDate" TIMESTAMP(3);
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "prestigeLevel" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "prestigePoints" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: Add traits column to Owl
ALTER TABLE "Owl" ADD COLUMN IF NOT EXISTS "traits" JSONB;

-- AlterTable: Add owlTraits column to Encounter
ALTER TABLE "Encounter" ADD COLUMN IF NOT EXISTS "owlTraits" JSONB;

-- CreateTable: PlayerBuff
CREATE TABLE IF NOT EXISTS "PlayerBuff" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "buffItemId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "effectType" TEXT NOT NULL,
    "effectValue" DOUBLE PRECISION NOT NULL,
    "chargeMax" INTEGER NOT NULL,
    "chargeCur" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerBuff_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SeasonArchive
CREATE TABLE IF NOT EXISTS "SeasonArchive" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "seasonType" TEXT NOT NULL,
    "powerScore" INTEGER NOT NULL DEFAULT 0,
    "totalHunts" INTEGER NOT NULL DEFAULT 0,
    "totalRareFinds" INTEGER NOT NULL DEFAULT 0,
    "totalPvpWins" INTEGER NOT NULL DEFAULT 0,
    "totalCoinsEarned" INTEGER NOT NULL DEFAULT 0,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SeasonArchive_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Season
CREATE TABLE IF NOT EXISTS "Season" (
    "id" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "seasonType" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PlayerRegistration
CREATE TABLE IF NOT EXISTS "PlayerRegistration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "guildId" TEXT NOT NULL,
    "guildName" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable: MarketListing
CREATE TABLE IF NOT EXISTS "MarketListing" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketListing_pkey" PRIMARY KEY ("id")
);

-- CreateTable: DailyQuest
CREATE TABLE IF NOT EXISTS "DailyQuest" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "target" INTEGER NOT NULL,
    "current" INTEGER NOT NULL DEFAULT 0,
    "rewardCoins" INTEGER NOT NULL,
    "rewardXp" INTEGER NOT NULL,
    "isClaimed" BOOLEAN NOT NULL DEFAULT false,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyQuest_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AuditLog
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB NOT NULL,
    "after" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Player leaderboard indexes
CREATE INDEX IF NOT EXISTS "Player_powerScore_idx" ON "Player"("powerScore");
CREATE INDEX IF NOT EXISTS "Player_totalHunts_idx" ON "Player"("totalHunts");
CREATE INDEX IF NOT EXISTS "Player_totalRareFinds_idx" ON "Player"("totalRareFinds");
CREATE INDEX IF NOT EXISTS "Player_totalPvpWins_idx" ON "Player"("totalPvpWins");
CREATE INDEX IF NOT EXISTS "Player_totalCoinsEarned_idx" ON "Player"("totalCoinsEarned");
CREATE INDEX IF NOT EXISTS "Player_totalXP_idx" ON "Player"("totalXP");

-- CreateIndex: PlayerBuff indexes
CREATE INDEX IF NOT EXISTS "PlayerBuff_playerId_category_idx" ON "PlayerBuff"("playerId", "category");
CREATE INDEX IF NOT EXISTS "PlayerBuff_playerId_effectType_idx" ON "PlayerBuff"("playerId", "effectType");
CREATE INDEX IF NOT EXISTS "PlayerBuff_playerId_category_chargeCur_idx" ON "PlayerBuff"("playerId", "category", "chargeCur");

-- CreateIndex: SeasonArchive indexes
CREATE INDEX IF NOT EXISTS "SeasonArchive_seasonId_idx" ON "SeasonArchive"("seasonId");
CREATE INDEX IF NOT EXISTS "SeasonArchive_playerId_idx" ON "SeasonArchive"("playerId");

-- CreateIndex: Owl indexes
CREATE INDEX IF NOT EXISTS "Owl_ownerId_isMain_idx" ON "Owl"("ownerId", "isMain");
CREATE INDEX IF NOT EXISTS "Owl_ownerId_passiveMode_idx" ON "Owl"("ownerId", "passiveMode");

-- CreateIndex: InventoryItem indexes
CREATE INDEX IF NOT EXISTS "InventoryItem_ownerId_idx" ON "InventoryItem"("ownerId");
CREATE INDEX IF NOT EXISTS "InventoryItem_ownerId_itemType_idx" ON "InventoryItem"("ownerId", "itemType");

-- CreateIndex: PvpSession indexes
CREATE INDEX IF NOT EXISTS "PvpSession_challengerId_idx" ON "PvpSession"("challengerId");
CREATE INDEX IF NOT EXISTS "PvpSession_defenderId_idx" ON "PvpSession"("defenderId");
CREATE INDEX IF NOT EXISTS "PvpSession_status_idx" ON "PvpSession"("status");

-- CreateIndex: Encounter indexes
CREATE INDEX IF NOT EXISTS "Encounter_playerId_status_idx" ON "Encounter"("playerId", "status");
CREATE INDEX IF NOT EXISTS "Encounter_status_createdAt_idx" ON "Encounter"("status", "createdAt");

-- CreateIndex: PlayerRegistration unique and indexes
CREATE UNIQUE INDEX IF NOT EXISTS "PlayerRegistration_userId_guildId_key" ON "PlayerRegistration"("userId", "guildId");
CREATE INDEX IF NOT EXISTS "PlayerRegistration_guildId_idx" ON "PlayerRegistration"("guildId");

-- CreateIndex: MarketListing indexes
CREATE INDEX IF NOT EXISTS "MarketListing_itemName_idx" ON "MarketListing"("itemName");
CREATE INDEX IF NOT EXISTS "MarketListing_sellerId_idx" ON "MarketListing"("sellerId");

-- CreateIndex: DailyQuest index
CREATE INDEX IF NOT EXISTS "DailyQuest_playerId_idx" ON "DailyQuest"("playerId");

-- CreateIndex: AuditLog index
CREATE INDEX IF NOT EXISTS "AuditLog_playerId_createdAt_idx" ON "AuditLog"("playerId", "createdAt");

-- AddForeignKey: PlayerBuff → Player
ALTER TABLE "PlayerBuff" ADD CONSTRAINT "PlayerBuff_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: SeasonArchive → Player
ALTER TABLE "SeasonArchive" ADD CONSTRAINT "SeasonArchive_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: PlayerRegistration → Player
ALTER TABLE "PlayerRegistration" ADD CONSTRAINT "PlayerRegistration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: MarketListing → Player
ALTER TABLE "MarketListing" ADD CONSTRAINT "MarketListing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: DailyQuest → Player
ALTER TABLE "DailyQuest" ADD CONSTRAINT "DailyQuest_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
