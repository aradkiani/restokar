-- End-of-day cash close, one per site per trading day.
ALTER TYPE "AuditAction" ADD VALUE 'DAY_CLOSED';

CREATE TABLE "DailyClose" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "summary" JSONB NOT NULL,
    "expectedCash" INTEGER NOT NULL,
    "countedCash" INTEGER NOT NULL,
    "difference" INTEGER NOT NULL,
    "note" TEXT,
    "closedById" TEXT,
    "closedByLabel" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyClose_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyClose_restaurantId_day_key" ON "DailyClose"("restaurantId", "day");

ALTER TABLE "DailyClose" ADD CONSTRAINT "DailyClose_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
