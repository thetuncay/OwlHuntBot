-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "mainOwlId" TEXT,
    "lastHunt" TIMESTAMP(3),
    "lastSwitch" TIMESTAMP(3),
    "pvpStreak" INTEGER NOT NULL DEFAULT 0,
    "pvpStreakLoss" INTEGER NOT NULL DEFAULT 0,
    "gambleStreakWins" INTEGER NOT NULL DEFAULT 0,
    "gambleStreakLosses" INTEGER NOT NULL DEFAULT 0,
    "huntComboStreak" INTEGER NOT NULL DEFAULT 0,
    "pvpCount" INTEGER NOT NULL DEFAULT 0,
    "switchPenaltyUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Owl" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "species" TEXT NOT NULL,
    "tier" INTEGER NOT NULL,
    "bond" INTEGER NOT NULL DEFAULT 0,
    "passiveMode" TEXT NOT NULL DEFAULT 'idle',
    "statGaga" INTEGER NOT NULL DEFAULT 1,
    "statGoz" INTEGER NOT NULL DEFAULT 1,
    "statKulak" INTEGER NOT NULL DEFAULT 1,
    "statKanat" INTEGER NOT NULL DEFAULT 1,
    "statPence" INTEGER NOT NULL DEFAULT 1,
    "quality" TEXT NOT NULL DEFAULT 'Common',
    "hp" INTEGER NOT NULL,
    "hpMax" INTEGER NOT NULL,
    "staminaCur" INTEGER NOT NULL,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "effectiveness" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Owl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryItem" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "rarity" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PvpSession" (
    "id" TEXT NOT NULL,
    "challengerId" TEXT NOT NULL,
    "defenderId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "winnerId" TEXT,
    "totalTurns" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "PvpSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Encounter" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "owlSpecies" TEXT NOT NULL,
    "owlTier" INTEGER NOT NULL,
    "owlQuality" TEXT NOT NULL,
    "owlStats" JSONB NOT NULL,
    "tameAttempts" INTEGER NOT NULL DEFAULT 0,
    "failStreak" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Encounter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_ownerId_itemName_key" ON "InventoryItem"("ownerId", "itemName");

-- AddForeignKey
ALTER TABLE "Owl" ADD CONSTRAINT "Owl_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PvpSession" ADD CONSTRAINT "PvpSession_challengerId_fkey" FOREIGN KEY ("challengerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PvpSession" ADD CONSTRAINT "PvpSession_defenderId_fkey" FOREIGN KEY ("defenderId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Encounter" ADD CONSTRAINT "Encounter_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
