-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "iconUrl" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "hideWhenUnavailable" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "staffCallEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "staffCallLabel" TEXT NOT NULL DEFAULT 'صدا زدن گارسون';

-- CreateTable
CREATE TABLE "StaffCall" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "tableNumber" TEXT NOT NULL,
    "note" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StaffCall_restaurantId_createdAt_idx" ON "StaffCall"("restaurantId", "createdAt");

-- AddForeignKey
ALTER TABLE "StaffCall" ADD CONSTRAINT "StaffCall_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
