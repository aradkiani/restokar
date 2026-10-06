-- Business day per site (opening and closing time), and the business date
-- stored on every order and stock movement. See src/lib/business-day.ts.

ALTER TABLE "Restaurant" ADD COLUMN "businessDayStart" INTEGER,
                         ADD COLUMN "businessDayEnd" INTEGER;

-- Minutes after midnight, and both or neither: half a setting means nothing.
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_businessDay_range"
  CHECK ("businessDayStart" IS NULL OR ("businessDayStart" BETWEEN 0 AND 1439));
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_businessDayEnd_range"
  CHECK ("businessDayEnd" IS NULL OR ("businessDayEnd" BETWEEN 0 AND 1439));
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_businessDay_pair"
  CHECK (("businessDayStart" IS NULL) = ("businessDayEnd" IS NULL));

-- Existing orders keep the day they were always reported under: the calendar
-- date in Tehran. "placedAt" holds UTC wall-clock time without a zone.
ALTER TABLE "Order" ADD COLUMN "businessDate" DATE;
UPDATE "Order"
   SET "businessDate" = (("placedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tehran')::date;
ALTER TABLE "Order" ALTER COLUMN "businessDate" SET NOT NULL;
CREATE INDEX "Order_restaurantId_businessDate_idx" ON "Order"("restaurantId", "businessDate");

ALTER TABLE "StockMovement" ADD COLUMN "businessDate" DATE;
UPDATE "StockMovement"
   SET "businessDate" = (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Tehran')::date;

-- The float in the drawer when the day opened.
ALTER TABLE "DailyClose" ADD COLUMN "openingCash" INTEGER NOT NULL DEFAULT 0;
