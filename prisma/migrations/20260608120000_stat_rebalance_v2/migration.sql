-- Stat Rebalance V2: base + trained columns + compensation inbox

ALTER TABLE "Owl" ADD COLUMN IF NOT EXISTS "statGagaBase" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Owl" ADD COLUMN IF NOT EXISTS "statGozBase" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Owl" ADD COLUMN IF NOT EXISTS "statKulakBase" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Owl" ADD COLUMN IF NOT EXISTS "statKanatBase" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Owl" ADD COLUMN IF NOT EXISTS "statPenceBase" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Owl" ADD COLUMN IF NOT EXISTS "statGagaTrained" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Owl" ADD COLUMN IF NOT EXISTS "statGozTrained" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Owl" ADD COLUMN IF NOT EXISTS "statKulakTrained" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Owl" ADD COLUMN IF NOT EXISTS "statKanatTrained" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Owl" ADD COLUMN IF NOT EXISTS "statPenceTrained" INTEGER NOT NULL DEFAULT 0;

UPDATE "Owl" SET
  "statGagaBase" = "statGaga",
  "statGozBase" = "statGoz",
  "statKulakBase" = "statKulak",
  "statKanatBase" = "statKanat",
  "statPenceBase" = "statPence",
  "statGagaTrained" = 0,
  "statGozTrained" = 0,
  "statKulakTrained" = 0,
  "statKanatTrained" = 0,
  "statPenceTrained" = 0;

CREATE TABLE IF NOT EXISTS "RebalanceCompensation" (
  "id" TEXT NOT NULL,
  "playerId" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "snapshot" JSONB NOT NULL,
  "claimedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RebalanceCompensation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "RebalanceCompensation_playerId_key" ON "RebalanceCompensation"("playerId");
CREATE INDEX IF NOT EXISTS "RebalanceCompensation_expiresAt_claimedAt_idx" ON "RebalanceCompensation"("expiresAt", "claimedAt");

DO $$ BEGIN
  ALTER TABLE "RebalanceCompensation" ADD CONSTRAINT "RebalanceCompensation_playerId_fkey"
    FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
