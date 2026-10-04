-- Inventory upgrade: per-site stock with weighted average cost, suppliers,
-- purchases, stocktakes, and a ledger that records site, cost, actor and note.
-- Data is moved in the next migration: Postgres will not use an enum value in
-- the same transaction that added it.

-- CreateEnum
CREATE TYPE "PurchasePaymentStatus" AS ENUM ('PAID', 'UNPAID');

-- AlterEnum

ALTER TYPE "AuditAction" ADD VALUE 'PURCHASE_RECORDED';
ALTER TYPE "AuditAction" ADD VALUE 'STOCK_WASTED';
ALTER TYPE "AuditAction" ADD VALUE 'STOCKTAKE_POSTED';

-- AlterEnum

ALTER TYPE "StockMovementReason" ADD VALUE 'OPENING';
ALTER TYPE "StockMovementReason" ADD VALUE 'PURCHASE';
ALTER TYPE "StockMovementReason" ADD VALUE 'WASTE';
ALTER TYPE "StockMovementReason" ADD VALUE 'STOCKTAKE';

-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_itemId_fkey";

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "categoryName" TEXT,
ADD COLUMN     "supplierId" TEXT;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "actorLabel" TEXT,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "purchaseId" TEXT,
ADD COLUMN     "restaurantId" TEXT,
ADD COLUMN     "stocktakeId" TEXT,
ADD COLUMN     "unitCost" DOUBLE PRECISION,
ADD COLUMN     "userId" TEXT,
ADD COLUMN     "wasteReason" TEXT;

-- CreateTable
CREATE TABLE "StockLevel" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "quantityMilli" INTEGER NOT NULL DEFAULT 0,
    "avgCost" DOUBLE PRECISION,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "supplierId" TEXT,
    "purchasedAt" TIMESTAMP(3) NOT NULL,
    "invoiceNumber" TEXT,
    "total" INTEGER NOT NULL,
    "paymentStatus" "PurchasePaymentStatus" NOT NULL DEFAULT 'PAID',
    "paidAt" TIMESTAMP(3),
    "note" TEXT,
    "createdById" TEXT,
    "createdByLabel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseLine" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantityMilli" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "lineTotal" INTEGER NOT NULL,

    CONSTRAINT "PurchaseLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stocktake" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdByLabel" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Stocktake_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StocktakeLine" (
    "id" TEXT NOT NULL,
    "stocktakeId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "expectedMilli" INTEGER NOT NULL,
    "countedMilli" INTEGER NOT NULL,
    "unitCost" DOUBLE PRECISION,

    CONSTRAINT "StocktakeLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StockLevel_restaurantId_idx" ON "StockLevel"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "StockLevel_itemId_restaurantId_key" ON "StockLevel"("itemId", "restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_restaurantId_name_key" ON "Supplier"("restaurantId", "name");

-- CreateIndex
CREATE INDEX "Purchase_restaurantId_purchasedAt_idx" ON "Purchase"("restaurantId", "purchasedAt");

-- CreateIndex
CREATE INDEX "PurchaseLine_purchaseId_idx" ON "PurchaseLine"("purchaseId");

-- CreateIndex
CREATE INDEX "Stocktake_restaurantId_postedAt_idx" ON "Stocktake"("restaurantId", "postedAt");

-- CreateIndex
CREATE INDEX "StocktakeLine_stocktakeId_idx" ON "StocktakeLine"("stocktakeId");

-- CreateIndex
CREATE INDEX "StockMovement_restaurantId_createdAt_idx" ON "StockMovement"("restaurantId", "createdAt");

-- AddForeignKey
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_stocktakeId_fkey" FOREIGN KEY ("stocktakeId") REFERENCES "Stocktake"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLevel" ADD CONSTRAINT "StockLevel_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseLine" ADD CONSTRAINT "PurchaseLine_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseLine" ADD CONSTRAINT "PurchaseLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stocktake" ADD CONSTRAINT "Stocktake_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StocktakeLine" ADD CONSTRAINT "StocktakeLine_stocktakeId_fkey" FOREIGN KEY ("stocktakeId") REFERENCES "Stocktake"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StocktakeLine" ADD CONSTRAINT "StocktakeLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

