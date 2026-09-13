-- CreateTable
CREATE TABLE "MenuDailyView" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuDailyView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderReview" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MenuDailyView_restaurantId_day_key" ON "MenuDailyView"("restaurantId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "OrderReview_orderId_key" ON "OrderReview"("orderId");

-- CreateIndex
CREATE INDEX "OrderReview_restaurantId_rating_idx" ON "OrderReview"("restaurantId", "rating");

-- CreateIndex
CREATE INDEX "OrderReview_restaurantId_createdAt_idx" ON "OrderReview"("restaurantId", "createdAt");

-- AddForeignKey
ALTER TABLE "MenuDailyView" ADD CONSTRAINT "MenuDailyView_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderReview" ADD CONSTRAINT "OrderReview_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderReview" ADD CONSTRAINT "OrderReview_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written constraints Prisma cannot express.
--
-- A rating outside 1-5 would not fail anywhere else: it would be stored, then
-- averaged, and the owner's "4.2 stars" would quietly be wrong. The column is
-- the only place this can be held.
--
-- A negative view count is meaningless and would silently reduce a day's total
-- if an increment were ever handed a negative number.
-- ---------------------------------------------------------------------------
ALTER TABLE "OrderReview"
  ADD CONSTRAINT "OrderReview_rating_range" CHECK ("rating" BETWEEN 1 AND 5);

ALTER TABLE "MenuDailyView"
  ADD CONSTRAINT "MenuDailyView_count_nonnegative" CHECK ("count" >= 0);
