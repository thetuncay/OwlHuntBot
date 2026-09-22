-- SellEvent: sell komutu rollback kayıtları (7 gün retention)
CREATE TABLE "SellEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "guildId" TEXT,
    "coinsGained" INTEGER NOT NULL,
    "preySold" JSONB NOT NULL,
    "preyQty" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'prefix',
    "rolledBackAt" TIMESTAMP(3),
    "rollbackBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SellEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SellEvent_userId_createdAt_idx" ON "SellEvent"("userId", "createdAt");
CREATE INDEX "SellEvent_createdAt_idx" ON "SellEvent"("createdAt");
CREATE INDEX "SellEvent_rollbackBatchId_idx" ON "SellEvent"("rollbackBatchId");
