-- OwlHunt Prestige Evolution v1.0

ALTER TABLE "Owl" ADD COLUMN "moonTier" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Owl" ADD COLUMN "moonTierPeak" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Owl" ADD COLUMN "evolutionHistory" JSONB;
ALTER TABLE "Owl" ADD COLUMN "unlockedVisuals" JSONB;

CREATE TABLE "PlayerOwlPrestigeDex" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "speciesTier" INTEGER NOT NULL,
    "moonTier" INTEGER NOT NULL,
    "firstUnlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerOwlPrestigeDex_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlayerOwlPrestigeDex_playerId_speciesTier_moonTier_key" ON "PlayerOwlPrestigeDex"("playerId", "speciesTier", "moonTier");
CREATE INDEX "PlayerOwlPrestigeDex_playerId_idx" ON "PlayerOwlPrestigeDex"("playerId");

ALTER TABLE "PlayerOwlPrestigeDex" ADD CONSTRAINT "PlayerOwlPrestigeDex_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
