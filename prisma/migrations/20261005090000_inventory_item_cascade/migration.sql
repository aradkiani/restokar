-- Ledger, invoice and count lines cascade with their item at the database
-- level. NO ACTION blocked deleting a whole venue, because Postgres checks it
-- at the end of each cascaded inner statement. Items with history are still
-- never deleted: the app archives them instead.

-- DropForeignKey
ALTER TABLE "PurchaseLine" DROP CONSTRAINT "PurchaseLine_itemId_fkey";

-- DropForeignKey
ALTER TABLE "StockMovement" DROP CONSTRAINT "StockMovement_itemId_fkey";

-- DropForeignKey
ALTER TABLE "StocktakeLine" DROP CONSTRAINT "StocktakeLine_itemId_fkey";

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseLine" ADD CONSTRAINT "PurchaseLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StocktakeLine" ADD CONSTRAINT "StocktakeLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

