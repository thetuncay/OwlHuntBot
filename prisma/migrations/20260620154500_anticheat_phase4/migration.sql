-- CreateTable
CREATE TABLE "AnticheatPunishment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "durationSeconds" INTEGER,
    "issuedBy" TEXT NOT NULL DEFAULT 'system',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "appealed" BOOLEAN NOT NULL DEFAULT false,
    "overturned" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AnticheatPunishment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnticheatAppeal" (
    "id" TEXT NOT NULL,
    "punishmentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedBy" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnticheatAppeal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnticheatPunishment_userId_issuedAt_idx" ON "AnticheatPunishment"("userId", "issuedAt" DESC);

-- CreateIndex
CREATE INDEX "AnticheatPunishment_tier_issuedAt_idx" ON "AnticheatPunishment"("tier", "issuedAt");

-- CreateIndex
CREATE INDEX "AnticheatAppeal_userId_createdAt_idx" ON "AnticheatAppeal"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AnticheatAppeal_punishmentId_idx" ON "AnticheatAppeal"("punishmentId");

-- CreateIndex
CREATE INDEX "AnticheatAppeal_status_createdAt_idx" ON "AnticheatAppeal"("status", "createdAt");
