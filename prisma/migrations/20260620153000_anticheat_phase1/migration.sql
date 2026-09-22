-- CreateTable
CREATE TABLE "AnticheatTrust" (
    "userId" TEXT NOT NULL,
    "trustScore" INTEGER NOT NULL DEFAULT 100,
    "violationCount" INTEGER NOT NULL DEFAULT 0,
    "lastViolationAt" TIMESTAMP(3),
    "isRewardThrottled" BOOLEAN NOT NULL DEFAULT false,
    "throttleUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnticheatTrust_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "AnticheatEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "guildId" TEXT,
    "eventType" TEXT NOT NULL,
    "severity" INTEGER NOT NULL,
    "detail" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnticheatEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnticheatTrust_trustScore_idx" ON "AnticheatTrust"("trustScore");

-- CreateIndex
CREATE INDEX "AnticheatTrust_lastViolationAt_idx" ON "AnticheatTrust"("lastViolationAt");

-- CreateIndex
CREATE INDEX "AnticheatEvent_userId_createdAt_idx" ON "AnticheatEvent"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AnticheatEvent_eventType_createdAt_idx" ON "AnticheatEvent"("eventType", "createdAt");
