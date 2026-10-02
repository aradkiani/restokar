-- An order takes, or gives back, each ingredient at most once. Checked before
-- applying: no existing (order, item, reason) appears twice. Rows without an
-- order (manual adjustments) never collide, because NULLs are distinct.
CREATE UNIQUE INDEX "StockMovement_orderId_itemId_reason_key" ON "StockMovement"("orderId", "itemId", "reason");
