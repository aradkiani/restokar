-- CreateEnum
CREATE TYPE "RecommendationEventType" AS ENUM ('IMPRESSION', 'INTERACTION', 'ADD_TO_CART');

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "recommendedFromProductId" TEXT;

-- CreateTable
CREATE TABLE "ProductRecommendation" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "sourceProductId" TEXT NOT NULL,
    "recommendedProductId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecommendationEvent" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "sourceProductId" TEXT NOT NULL,
    "recommendedProductId" TEXT NOT NULL,
    "type" "RecommendationEventType" NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecommendationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductRecommendation_sourceProductId_sortOrder_idx" ON "ProductRecommendation"("sourceProductId", "sortOrder");

-- CreateIndex
CREATE INDEX "ProductRecommendation_restaurantId_idx" ON "ProductRecommendation"("restaurantId");

-- CreateIndex
CREATE INDEX "ProductRecommendation_recommendedProductId_idx" ON "ProductRecommendation"("recommendedProductId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductRecommendation_sourceProductId_recommendedProductId_key" ON "ProductRecommendation"("sourceProductId", "recommendedProductId");

-- CreateIndex
CREATE INDEX "RecommendationEvent_restaurantId_createdAt_idx" ON "RecommendationEvent"("restaurantId", "createdAt");

-- CreateIndex
CREATE INDEX "RecommendationEvent_restaurantId_sourceProductId_recommende_idx" ON "RecommendationEvent"("restaurantId", "sourceProductId", "recommendedProductId");

-- CreateIndex
CREATE UNIQUE INDEX "RecommendationEvent_sessionKey_sourceProductId_recommendedP_key" ON "RecommendationEvent"("sessionKey", "sourceProductId", "recommendedProductId", "type");

-- CreateIndex
CREATE INDEX "OrderItem_recommendedFromProductId_idx" ON "OrderItem"("recommendedFromProductId");

-- AddForeignKey
ALTER TABLE "ProductRecommendation" ADD CONSTRAINT "ProductRecommendation_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRecommendation" ADD CONSTRAINT "ProductRecommendation_sourceProductId_fkey" FOREIGN KEY ("sourceProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductRecommendation" ADD CONSTRAINT "ProductRecommendation_recommendedProductId_fkey" FOREIGN KEY ("recommendedProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecommendationEvent" ADD CONSTRAINT "RecommendationEvent_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_recommendedFromProductId_fkey" FOREIGN KEY ("recommendedFromProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- A constraint Prisma's schema language cannot express.
--
-- The table is created empty in this same migration, so it cannot fail against
-- existing data.
-- ---------------------------------------------------------------------------

-- A dish cannot suggest itself. The API refuses it too, with a message an owner
-- can act on; this is the copy that holds regardless of which code path writes
-- the row, and it is cheap because the pair is already indexed.
ALTER TABLE "ProductRecommendation"
    ADD CONSTRAINT "ProductRecommendation_no_self_reference"
    CHECK ("sourceProductId" <> "recommendedProductId");
