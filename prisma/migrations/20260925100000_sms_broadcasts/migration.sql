-- Paid promotional SMS broadcasts.
--
-- Additive only: one new enum, three new enum values, one nullable column on
-- Payment and one new table. No existing row is rewritten.
--
-- A venue pays the platform for a broadcast and platform staff send it with a
-- separate tool. Nothing in the application delivers it; see
-- src/lib/sms-broadcast.ts.

-- CreateEnum
CREATE TYPE "SmsBroadcastStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'SENT', 'CANCELED');

-- AlterEnum
-- Two values in one migration is safe on PostgreSQL 12+ (the project runs 16):
-- neither new value is used inside this migration, which is the only thing
-- PostgreSQL forbids after an ADD VALUE in the same transaction.

ALTER TYPE "AuditAction" ADD VALUE 'SMS_BROADCAST_REQUESTED';
ALTER TYPE "AuditAction" ADD VALUE 'SMS_BROADCAST_STATUS_CHANGED';

-- AlterEnum
ALTER TYPE "PaymentPurpose" ADD VALUE 'SMS_BROADCAST';

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "smsBroadcastId" TEXT;

-- CreateTable
CREATE TABLE "SmsBroadcast" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "campaignId" TEXT,
    "audience" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "recipients" TEXT[],
    "recipientCount" INTEGER NOT NULL,
    "smsParts" INTEGER NOT NULL,
    "pricePerPart" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "SmsBroadcastStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "paidAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmsBroadcast_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SmsBroadcast_restaurantId_createdAt_idx" ON "SmsBroadcast"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "SmsBroadcast_status_paidAt_idx" ON "SmsBroadcast"("status", "paidAt");

-- CreateIndex
CREATE INDEX "SmsBroadcast_campaignId_idx" ON "SmsBroadcast"("campaignId");

-- CreateIndex
CREATE INDEX "Payment_smsBroadcastId_idx" ON "Payment"("smsBroadcastId");

-- AddForeignKey
ALTER TABLE "SmsBroadcast" ADD CONSTRAINT "SmsBroadcast_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsBroadcast" ADD CONSTRAINT "SmsBroadcast_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmsBroadcast" ADD CONSTRAINT "SmsBroadcast_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_smsBroadcastId_fkey" FOREIGN KEY ("smsBroadcastId") REFERENCES "SmsBroadcast"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The audience vocabulary, held the same way Campaign.targetSegment is: the
-- application defines the segments in src/lib/customers.ts, and this is the
-- copy that holds whichever code path writes the row. `all` is the one value
-- a broadcast adds — every consenting customer, regardless of segment.
ALTER TABLE "SmsBroadcast"
    ADD CONSTRAINT "SmsBroadcast_audience_known"
    CHECK ("audience" IN ('all', 'new', 'returning', 'loyal', 'atRisk', 'inactive'));

-- The bill, enforced where it is stored. The amount a venue paid, the numbers
-- staff send to and the figures shown on both screens are the same row, and a
-- code path that wrote one without the others would be charging for a list that
-- is not the list. Every factor is positive: an empty broadcast is refused
-- before it is priced, and a zero-rate one would be free SMS.
ALTER TABLE "SmsBroadcast"
    ADD CONSTRAINT "SmsBroadcast_priced_consistently"
    CHECK (
        "recipientCount" > 0
        AND "smsParts" > 0
        AND "pricePerPart" > 0
        AND "recipientCount" = cardinality("recipients")
        AND "amount" = "recipientCount" * "smsParts" * "pricePerPart"
    );
