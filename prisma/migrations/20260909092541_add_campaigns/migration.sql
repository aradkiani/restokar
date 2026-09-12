-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'CAMPAIGN_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'CAMPAIGN_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'CAMPAIGN_STATUS_CHANGED';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "campaignId" TEXT;

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "targetSegment" TEXT NOT NULL,
    "productId" TEXT,
    "categoryId" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "audienceSnapshotSize" INTEGER,
    "audienceSnapshotEligible" INTEGER,
    "audienceSnapshotAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Campaign_restaurantId_status_idx" ON "Campaign"("restaurantId", "status");

-- CreateIndex
CREATE INDEX "Campaign_restaurantId_createdAt_idx" ON "Campaign"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "Campaign_productId_idx" ON "Campaign"("productId");

-- CreateIndex
CREATE INDEX "Campaign_categoryId_idx" ON "Campaign"("categoryId");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The segment catalogue, as one list the database also knows.
--
-- Text rather than a second Prisma enum so CUSTOMER_SEGMENTS in
-- src/lib/customers.ts stays the only definition of what a segment *is*; this
-- is the copy that holds whichever code path writes the row. The rules behind
-- the names — how many orders make a regular, how long a silence lasts — are
-- deliberately not here. They are recency arithmetic, they change, and a
-- database has no business deciding them.
ALTER TABLE "Campaign"
    ADD CONSTRAINT "Campaign_target_segment_known"
    CHECK ("targetSegment" IN ('new', 'returning', 'loyal', 'atRisk', 'inactive'));

-- A campaign window that closes before it opens can never be open, so the
-- campaign would silently never run and the owner would have nothing telling
-- them why. The API refuses it with a message they can act on; this is the copy
-- that holds regardless. Either end may still be NULL, which means open-ended
-- in that direction. Equal ends are rejected too: a zero-length window is the
-- same "never" written differently.
ALTER TABLE "Campaign"
    ADD CONSTRAINT "Campaign_window_ordered"
    CHECK (
        "startsAt" IS NULL
        OR "endsAt" IS NULL
        OR "endsAt" > "startsAt"
    );