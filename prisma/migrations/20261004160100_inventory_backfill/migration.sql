-- Moves existing stock onto the per-site model. Nothing is deleted and no old
-- column is changed, so rolling back is dropping what the previous migration
-- added.

-- 1. Every existing ledger row belongs to the item owner's site: before this
--    release a chain shared one set of shelves, held by the menu owner.
UPDATE "StockMovement" m
SET "restaurantId" = i."restaurantId"
FROM "InventoryItem" i
WHERE m."itemId" = i.id AND m."restaurantId" IS NULL;

-- 2. One stock level per item at its owner's site, holding today's quantity.
--    The average cost starts unknown: until a purchase is recorded the code
--    falls back to the owner's reference price, converted to the item's unit.
INSERT INTO "StockLevel" ("id", "itemId", "restaurantId", "quantityMilli", "avgCost", "updatedAt")
SELECT 'sl' || md5(i.id || ':level'), i.id, i."restaurantId", i."quantityMilli", NULL, CURRENT_TIMESTAMP
FROM "InventoryItem" i
ON CONFLICT ("itemId", "restaurantId") DO NOTHING;

-- 3. An OPENING row wherever the ledger does not already add up to the shelf
--    (an item created with a quantity wrote no movement), so that from here
--    on the sum of an item's movements at a site is its stock level.
INSERT INTO "StockMovement" ("id", "itemId", "restaurantId", "deltaMilli", "reason", "createdAt", "note")
SELECT 'sm' || md5(i.id || ':opening'), i.id, i."restaurantId",
       i."quantityMilli" - COALESCE(sums.total, 0), 'OPENING', i."createdAt",
       'Opening balance'
FROM "InventoryItem" i
LEFT JOIN (
  SELECT "itemId", SUM("deltaMilli") AS total FROM "StockMovement" GROUP BY "itemId"
) sums ON sums."itemId" = i.id
WHERE i."quantityMilli" - COALESCE(sums.total, 0) <> 0;
