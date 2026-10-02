-- One checkout attempt, one order: a retried request with the same key
-- returns the order already placed. NULLs (staff orders, older rows) never
-- collide in a Postgres unique index.
ALTER TABLE "Order" ADD COLUMN "clientKey" TEXT;

CREATE UNIQUE INDEX "Order_restaurantId_clientKey_key" ON "Order"("restaurantId", "clientKey");
