-- Daily login streak + starter pack idempotency
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "loginStreak" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "lastDailyClaimAt" TIMESTAMP(3);
ALTER TABLE "Player" ADD COLUMN IF NOT EXISTS "starterPackClaimedAt" TIMESTAMP(3);
