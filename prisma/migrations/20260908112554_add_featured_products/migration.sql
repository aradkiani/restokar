-- CreateEnum
CREATE TYPE "FeaturedEventType" AS ENUM ('IMPRESSION', 'VIEW', 'ADD_TO_CART');

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "fromFeatured" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "featuredFrom" TIMESTAMP(3),
ADD COLUMN     "featuredLabel" TEXT,
ADD COLUMN     "featuredLabelText" TEXT,
ADD COLUMN     "featuredOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "featuredUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "featuredSectionEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "FeaturedProductEvent" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "FeaturedEventType" NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeaturedProductEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FeaturedProductEvent_restaurantId_createdAt_idx" ON "FeaturedProductEvent"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "FeaturedProductEvent_restaurantId_productId_idx" ON "FeaturedProductEvent"("restaurantId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "FeaturedProductEvent_sessionKey_productId_type_key" ON "FeaturedProductEvent"("sessionKey", "productId", "type");

-- AddForeignKey
ALTER TABLE "FeaturedProductEvent" ADD CONSTRAINT "FeaturedProductEvent_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- A constraint Prisma's schema language cannot express.
--
-- Every existing row has NULL at both ends, so this cannot fail against the
-- data already in the table.
-- ---------------------------------------------------------------------------

-- A promotion window that ends before it starts can never open, so an owner who
-- typed the dates the wrong way round would see the dish silently never appear
-- and have nothing to tell them why. The API refuses it with a message; this is
-- the copy that holds whichever code path writes the row. Either end may still
-- be NULL, which means open-ended in that direction.
ALTER TABLE "Product"
    ADD CONSTRAINT "Product_featured_window_ordered"
    CHECK (
        "featuredFrom" IS NULL
        OR "featuredUntil" IS NULL
        OR "featuredUntil" > "featuredFrom"
    );
