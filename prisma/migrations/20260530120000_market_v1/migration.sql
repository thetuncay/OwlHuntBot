-- Market v1.0: listingNo, escrow status, sales history, analytics, suspicious logs

-- MarketListing genişletme
ALTER TABLE "MarketListing" ADD COLUMN IF NOT EXISTS "listingNo" SERIAL;
ALTER TABLE "MarketListing" ADD COLUMN IF NOT EXISTS "itemId" TEXT;
ALTER TABLE "MarketListing" ADD COLUMN IF NOT EXISTS "marketCategory" TEXT;
ALTER TABLE "MarketListing" ADD COLUMN IF NOT EXISTS "listingFeePaid" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "MarketListing" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "MarketListing" ADD COLUMN IF NOT EXISTS "buyerId" TEXT;
ALTER TABLE "MarketListing" ADD COLUMN IF NOT EXISTS "soldAt" TIMESTAMP(3);

UPDATE "MarketListing"
SET
  "itemId" = COALESCE("itemId", "itemName"),
  "marketCategory" = COALESCE("marketCategory",
    CASE
      WHEN LOWER("itemType") = 'buff' THEN 'buff'
      WHEN LOWER("itemType") IN ('materyal', 'material', 'av') THEN 'material'
      ELSE 'item'
    END
  ),
  "status" = COALESCE("status", 'active')
WHERE "itemId" IS NULL OR "marketCategory" IS NULL;

ALTER TABLE "MarketListing" ALTER COLUMN "itemId" SET NOT NULL;
ALTER TABLE "MarketListing" ALTER COLUMN "marketCategory" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "MarketListing_listingNo_key" ON "MarketListing"("listingNo");
CREATE INDEX IF NOT EXISTS "MarketListing_itemId_idx" ON "MarketListing"("itemId");
CREATE INDEX IF NOT EXISTS "MarketListing_sellerId_status_idx" ON "MarketListing"("sellerId", "status");
CREATE INDEX IF NOT EXISTS "MarketListing_status_expiresAt_idx" ON "MarketListing"("status", "expiresAt");
CREATE INDEX IF NOT EXISTS "MarketListing_marketCategory_status_idx" ON "MarketListing"("marketCategory", "status");

-- MarketSale
CREATE TABLE IF NOT EXISTS "MarketSale" (
    "id" SERIAL NOT NULL,
    "listingId" TEXT NOT NULL,
    "listingNo" INTEGER NOT NULL,
    "sellerId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "itemType" TEXT NOT NULL,
    "marketCategory" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "salePrice" INTEGER NOT NULL,
    "taxPaid" INTEGER NOT NULL,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "soldAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketSale_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MarketSale_itemId_idx" ON "MarketSale"("itemId");
CREATE INDEX IF NOT EXISTS "MarketSale_itemName_idx" ON "MarketSale"("itemName");
CREATE INDEX IF NOT EXISTS "MarketSale_sellerId_buyerId_idx" ON "MarketSale"("sellerId", "buyerId");
CREATE INDEX IF NOT EXISTS "MarketSale_soldAt_idx" ON "MarketSale"("soldAt");

-- MarketAnalytics
CREATE TABLE IF NOT EXISTS "MarketAnalytics" (
    "itemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "lastSalePrice" INTEGER NOT NULL DEFAULT 0,
    "averagePrice24h" INTEGER NOT NULL DEFAULT 0,
    "averagePrice7d" INTEGER NOT NULL DEFAULT 0,
    "medianPrice30d" INTEGER NOT NULL DEFAULT 0,
    "salesCount24h" INTEGER NOT NULL DEFAULT 0,
    "salesCount7d" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketAnalytics_pkey" PRIMARY KEY ("itemId")
);

CREATE INDEX IF NOT EXISTS "MarketAnalytics_itemName_idx" ON "MarketAnalytics"("itemName");

-- MarketSuspiciousLog
CREATE TABLE IF NOT EXISTS "MarketSuspiciousLog" (
    "id" SERIAL NOT NULL,
    "saleId" INTEGER,
    "listingId" TEXT,
    "sellerId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "salePrice" INTEGER NOT NULL,
    "riskScore" INTEGER NOT NULL,
    "riskFactors" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MarketSuspiciousLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MarketSuspiciousLog_riskScore_idx" ON "MarketSuspiciousLog"("riskScore");
CREATE INDEX IF NOT EXISTS "MarketSuspiciousLog_sellerId_buyerId_idx" ON "MarketSuspiciousLog"("sellerId", "buyerId");
CREATE INDEX IF NOT EXISTS "MarketSuspiciousLog_createdAt_idx" ON "MarketSuspiciousLog"("createdAt");
