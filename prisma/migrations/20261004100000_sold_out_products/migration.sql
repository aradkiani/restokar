-- Dishes a site has run out of until the next trading day.
ALTER TYPE "AuditAction" ADD VALUE 'SOLD_OUT_CHANGED';

CREATE TABLE "SoldOutProduct" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "until" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "SoldOutProduct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SoldOutProduct_restaurantId_productId_key" ON "SoldOutProduct"("restaurantId", "productId");
CREATE INDEX "SoldOutProduct_restaurantId_until_idx" ON "SoldOutProduct"("restaurantId", "until");

ALTER TABLE "SoldOutProduct" ADD CONSTRAINT "SoldOutProduct_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SoldOutProduct" ADD CONSTRAINT "SoldOutProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
