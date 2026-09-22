-- PlayerPreyDex: ömür boyu yakalanan av hayvanları (satılsa bile zoo'da görünür)

CREATE TABLE "PlayerPreyDex" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "preyName" TEXT NOT NULL,
    "totalCaught" INTEGER NOT NULL DEFAULT 0,
    "firstCaughtAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerPreyDex_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlayerPreyDex_playerId_preyName_key" ON "PlayerPreyDex"("playerId", "preyName");
CREATE INDEX "PlayerPreyDex_playerId_idx" ON "PlayerPreyDex"("playerId");

ALTER TABLE "PlayerPreyDex" ADD CONSTRAINT "PlayerPreyDex_playerId_fkey"
    FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mevcut envanterden backfill
INSERT INTO "PlayerPreyDex" ("id", "playerId", "preyName", "totalCaught", "firstCaughtAt")
SELECT gen_random_uuid()::text, "ownerId", "itemName", "quantity", NOW()
FROM "InventoryItem"
WHERE "itemType" = 'Av' AND "quantity" > 0
ON CONFLICT ("playerId", "preyName") DO UPDATE
SET "totalCaught" = GREATEST("PlayerPreyDex"."totalCaught", EXCLUDED."totalCaught");
