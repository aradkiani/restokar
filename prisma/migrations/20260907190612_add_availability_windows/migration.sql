-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'SCHEDULE_CHANGED';

-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "scheduleEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "scheduleEnabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "AvailabilityWindow" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "productId" TEXT,
    "categoryId" TEXT,
    "dayOfWeek" INTEGER NOT NULL,
    "startMinute" INTEGER NOT NULL,
    "endMinute" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AvailabilityWindow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AvailabilityWindow_productId_idx" ON "AvailabilityWindow"("productId");

-- CreateIndex
CREATE INDEX "AvailabilityWindow_categoryId_idx" ON "AvailabilityWindow"("categoryId");

-- CreateIndex
CREATE INDEX "AvailabilityWindow_restaurantId_idx" ON "AvailabilityWindow"("restaurantId");

-- AddForeignKey
ALTER TABLE "AvailabilityWindow" ADD CONSTRAINT "AvailabilityWindow_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityWindow" ADD CONSTRAINT "AvailabilityWindow_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityWindow" ADD CONSTRAINT "AvailabilityWindow_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Constraints Prisma's schema language cannot express, added by hand.
--
-- The table is created empty in this same migration, so none of these can fail
-- against existing data.
-- ---------------------------------------------------------------------------

-- Exactly one target. A window belongs to a product or to a category, never to
-- both and never to neither: either would be a row the availability rules have
-- no meaning for. `<>` on two booleans is XOR.
ALTER TABLE "AvailabilityWindow"
    ADD CONSTRAINT "AvailabilityWindow_one_target"
    CHECK (("productId" IS NOT NULL) <> ("categoryId" IS NOT NULL));

-- Weekday in the JavaScript convention, 0 = Sunday … 6 = Saturday.
ALTER TABLE "AvailabilityWindow"
    ADD CONSTRAINT "AvailabilityWindow_day_range"
    CHECK ("dayOfWeek" BETWEEN 0 AND 6);

-- Wall-clock bounds. `endMinute` reaches 1440 so midnight at the *end* of a day
-- is expressible and "18:00 until midnight" stays a same-day window.
--
-- `startMinute <> endMinute` because a zero-length window is meaningless: read
-- as a same-day range it is never open, and read as an overnight one it is
-- always open. Rejecting it is the only reading that cannot surprise an owner.
-- An end that is merely *earlier* than the start is legitimate and deliberately
-- allowed — that is how an overnight window is written.
ALTER TABLE "AvailabilityWindow"
    ADD CONSTRAINT "AvailabilityWindow_minute_range"
    CHECK (
        "startMinute" BETWEEN 0 AND 1439
        AND "endMinute" BETWEEN 1 AND 1440
        AND "startMinute" <> "endMinute"
    );
