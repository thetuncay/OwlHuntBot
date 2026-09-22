-- Feedback survey portal
CREATE TABLE "FeedbackCampaign" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rewardCoins" INTEGER NOT NULL DEFAULT 2000,
    "rewardLootboxName" TEXT NOT NULL DEFAULT 'Eşya Kutusu',
    "rewardLootboxQty" INTEGER NOT NULL DEFAULT 3,
    "questions" JSONB NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackCampaign_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FeedbackCampaign_slug_key" ON "FeedbackCampaign"("slug");

CREATE TABLE "FeedbackSubmission" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "rewardGranted" BOOLEAN NOT NULL DEFAULT false,
    "rewardGrantedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedbackSubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FeedbackSubmission_campaignId_userId_key" ON "FeedbackSubmission"("campaignId", "userId");
CREATE INDEX "FeedbackSubmission_campaignId_submittedAt_idx" ON "FeedbackSubmission"("campaignId", "submittedAt");
CREATE INDEX "FeedbackSubmission_userId_idx" ON "FeedbackSubmission"("userId");

ALTER TABLE "FeedbackSubmission" ADD CONSTRAINT "FeedbackSubmission_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "FeedbackCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "FeedbackAttachment" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedbackAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FeedbackAttachment_campaignId_userId_idx" ON "FeedbackAttachment"("campaignId", "userId");
CREATE INDEX "FeedbackAttachment_userId_createdAt_idx" ON "FeedbackAttachment"("userId", "createdAt");
