-- Widen the menu-view aggregate from (venue, day) to (venue, table, day).
--
-- Additive in the only sense that matters: no row is deleted, no value is
-- rewritten, and every existing row keeps the total it already held. Existing
-- rows take `''` — "this open did not come through a table's QR code" — which
-- is exactly what they meant when the column did not exist, because nothing
-- could record a table then.
--
-- `''` rather than NULL because Postgres treats NULLs as distinct inside a
-- unique index. A nullable column would let each untabled open insert its own
-- row instead of colliding, and the upsert-and-increment in menu-views.ts would
-- silently stop aggregating.
ALTER TABLE "MenuDailyView" ADD COLUMN "tableNumber" TEXT NOT NULL DEFAULT '';

-- The old key is a strict prefix of the new one, so uniqueness that held before
-- still holds: two rows for the same (venue, day) are now permitted only when
-- they carry different table numbers, which is the whole point.
DROP INDEX "MenuDailyView_restaurantId_day_key";

CREATE UNIQUE INDEX "MenuDailyView_restaurantId_day_tableNumber_key"
  ON "MenuDailyView"("restaurantId", "day", "tableNumber");
