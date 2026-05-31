-- CreateIndex
CREATE INDEX "Player_updatedAt_idx" ON "Player"("updatedAt");

-- CreateIndex
CREATE INDEX "Player_level_xp_idx" ON "Player"("level", "xp");

-- CreateIndex
CREATE INDEX "Player_coins_idx" ON "Player"("coins");

-- CreateIndex
CREATE INDEX "MarketSale_itemId_soldAt_idx" ON "MarketSale"("itemId", "soldAt");

-- CreateIndex
CREATE INDEX "DailyQuest_playerId_type_resetAt_idx" ON "DailyQuest"("playerId", "type", "resetAt");
