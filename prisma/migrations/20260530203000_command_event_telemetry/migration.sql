-- CreateTable
CREATE TABLE "CommandEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'owl_command',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommandEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommandEvent_userId_createdAt_idx" ON "CommandEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "CommandEvent_guildId_createdAt_idx" ON "CommandEvent"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "CommandEvent_command_idx" ON "CommandEvent"("command");
