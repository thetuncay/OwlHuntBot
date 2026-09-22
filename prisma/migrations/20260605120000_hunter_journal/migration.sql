-- CreateTable
CREATE TABLE "PlayerRecipeProgress" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "discovered" BOOLEAN NOT NULL DEFAULT false,
    "discoveredAt" TIMESTAMP(3),
    "craftedCount" INTEGER NOT NULL DEFAULT 0,
    "lastCraftedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3),

    CONSTRAINT "PlayerRecipeProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "recipeId" TEXT,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PlayerRecipeProgress_playerId_idx" ON "PlayerRecipeProgress"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerRecipeProgress_playerId_recipeId_key" ON "PlayerRecipeProgress"("playerId", "recipeId");

-- CreateIndex
CREATE INDEX "JournalEntry_playerId_createdAt_idx" ON "JournalEntry"("playerId", "createdAt");

-- AddForeignKey
ALTER TABLE "PlayerRecipeProgress" ADD CONSTRAINT "PlayerRecipeProgress_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed starter discoveries for existing players (c000–c003)
INSERT INTO "PlayerRecipeProgress" ("id", "playerId", "recipeId", "discovered", "discoveredAt", "firstSeenAt")
SELECT
  p."id" || ':' || r."recipeId",
  p."id",
  r."recipeId",
  true,
  NOW(),
  NOW()
FROM "Player" p
CROSS JOIN (
  VALUES ('c000'), ('c001'), ('c002'), ('c003')
) AS r("recipeId")
ON CONFLICT ("playerId", "recipeId") DO NOTHING;
