-- AlterTable
ALTER TABLE "ProductOptionGroup" ADD COLUMN     "isUpgrade" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ProductBundleItem" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "bundleProductId" TEXT NOT NULL,
    "componentProductId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductBundleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductPairStat" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "sourceProductId" TEXT NOT NULL,
    "targetProductId" TEXT NOT NULL,
    "pairCount" INTEGER NOT NULL DEFAULT 0,
    "sourceSupport" INTEGER NOT NULL DEFAULT 0,
    "targetSupport" INTEGER NOT NULL DEFAULT 0,
    "totalOrders" INTEGER NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductPairStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductBundleItem_bundleProductId_sortOrder_idx" ON "ProductBundleItem"("bundleProductId", "sortOrder");

-- CreateIndex
CREATE INDEX "ProductBundleItem_restaurantId_idx" ON "ProductBundleItem"("restaurantId");

-- CreateIndex
CREATE INDEX "ProductBundleItem_componentProductId_idx" ON "ProductBundleItem"("componentProductId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductBundleItem_bundleProductId_componentProductId_key" ON "ProductBundleItem"("bundleProductId", "componentProductId");

-- CreateIndex
CREATE INDEX "ProductPairStat_sourceProductId_idx" ON "ProductPairStat"("sourceProductId");

-- CreateIndex
CREATE INDEX "ProductPairStat_restaurantId_computedAt_idx" ON "ProductPairStat"("restaurantId", "computedAt");

-- CreateIndex
CREATE INDEX "ProductPairStat_targetProductId_idx" ON "ProductPairStat"("targetProductId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductPairStat_sourceProductId_targetProductId_key" ON "ProductPairStat"("sourceProductId", "targetProductId");

-- AddForeignKey
ALTER TABLE "ProductBundleItem" ADD CONSTRAINT "ProductBundleItem_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductBundleItem" ADD CONSTRAINT "ProductBundleItem_bundleProductId_fkey" FOREIGN KEY ("bundleProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductBundleItem" ADD CONSTRAINT "ProductBundleItem_componentProductId_fkey" FOREIGN KEY ("componentProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPairStat" ADD CONSTRAINT "ProductPairStat_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPairStat" ADD CONSTRAINT "ProductPairStat_sourceProductId_fkey" FOREIGN KEY ("sourceProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductPairStat" ADD CONSTRAINT "ProductPairStat_targetProductId_fkey" FOREIGN KEY ("targetProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Constraints Prisma's schema language cannot express.
--
-- Both tables are created empty in this same migration, so none of these can
-- fail against existing data. The new column on ProductOptionGroup carries a
-- default and is therefore additive for every existing row.
-- ---------------------------------------------------------------------------

-- A bundle cannot contain itself.
--
-- Not merely tidiness: `isBundleOrderable` resolves a bundle's availability
-- from its components, so a self-referencing row makes that rule recurse. The
-- API refuses it too, with a message an owner can act on; this is the copy that
-- holds regardless of which code path writes the row.
ALTER TABLE "ProductBundleItem"
    ADD CONSTRAINT "ProductBundleItem_no_self_reference"
    CHECK ("bundleProductId" <> "componentProductId");

-- A component the bundle contains none of is not a component. `normaliseComponents`
-- drops these in the domain layer; this stops one being stored in the first place.
ALTER TABLE "ProductBundleItem"
    ADD CONSTRAINT "ProductBundleItem_quantity_positive"
    CHECK ("quantity" > 0);

-- A dish is not co-ordered with itself. Every bill containing it would satisfy
-- the join, so such a row would carry the highest pair count on the menu and
-- rank first for every dish that had one.
ALTER TABLE "ProductPairStat"
    ADD CONSTRAINT "ProductPairStat_no_self_reference"
    CHECK ("sourceProductId" <> "targetProductId");

-- Counts are counts. A negative one cannot arise from the counting pass, but a
-- future writer getting the arithmetic wrong would otherwise produce confidence
-- and lift figures that are silently meaningless rather than obviously absent.
ALTER TABLE "ProductPairStat"
    ADD CONSTRAINT "ProductPairStat_counts_nonnegative"
    CHECK (
        "pairCount" >= 0
        AND "sourceSupport" >= 0
        AND "targetSupport" >= 0
        AND "totalOrders" >= 0
    );
