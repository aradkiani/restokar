-- Removes مثقال (mesghal) from the inventory unit catalogue.
--
-- Checked before writing this migration: no InventoryItem and no
-- ProductIngredient row used it, and neither did any archive in data/backups.
-- If a row appears before this runs, the migration stops rather than deleting
-- or silently re-reading it — converting it to grams (1 mesghal = 4.608 g) is a
-- decision for the owner, not for a schema change.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "InventoryItem" WHERE "unit" = 'mesghal' OR "priceUnit" = 'mesghal')
     OR EXISTS (SELECT 1 FROM "ProductIngredient" WHERE "unit" = 'mesghal') THEN
    RAISE EXCEPTION 'The mesghal unit is still in use. Convert those rows to grams before removing it.';
  END IF;
END $$;

-- The same three constraints the costing migration created, without the unit.
-- They must match UNIT_CODES in src/lib/units.ts.
ALTER TABLE "InventoryItem" DROP CONSTRAINT "InventoryItem_unit_known";
ALTER TABLE "InventoryItem"
    ADD CONSTRAINT "InventoryItem_unit_known"
    CHECK ("unit" IN ('g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'piece', 'dozen'));

ALTER TABLE "InventoryItem" DROP CONSTRAINT "InventoryItem_price_consistent";
ALTER TABLE "InventoryItem"
    ADD CONSTRAINT "InventoryItem_price_consistent"
    CHECK (
        ("purchasePrice" IS NULL AND "priceUnit" IS NULL)
        OR (
            "purchasePrice" > 0
            AND (
                ("unit" IN ('g', 'kg') AND "priceUnit" IN ('g', 'kg'))
                OR ("unit" IN ('ml', 'l', 'tsp', 'tbsp') AND "priceUnit" IN ('ml', 'l', 'tsp', 'tbsp'))
                OR ("unit" IN ('piece', 'dozen') AND "priceUnit" IN ('piece', 'dozen'))
            )
        )
    );

ALTER TABLE "ProductIngredient" DROP CONSTRAINT "ProductIngredient_unit_known";
ALTER TABLE "ProductIngredient"
    ADD CONSTRAINT "ProductIngredient_unit_known"
    CHECK ("unit" IS NULL OR "unit" IN ('g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'piece', 'dozen'));

-- Restores keep working: the legacy-unit trigger now reads مثقال as grams.
CREATE OR REPLACE FUNCTION "inventory_legacy_unit"() RETURNS trigger AS $$
BEGIN
  -- مثقال (4.608 g) was removed from the catalogue. An old archive's label, or a
  -- v13 archive's 'mesghal' code, becomes grams, and the stock figures — held
  -- in thousandths of the item's own unit — are converted with it.
  IF btrim(NEW."unit") IN ('مثقال', 'mesghal') THEN
    NEW."unit" := 'g';
    NEW."quantityMilli" := round(NEW."quantityMilli" * 4.608);
    NEW."lowStockMilli" := round(NEW."lowStockMilli" * 4.608);
  END IF;
  -- A price quoted per mesghal becomes a price per kilogram: 1000 / 4.608
  -- mesghal to the kilogram, so a whole-Toman price stays close to exact.
  IF NEW."priceUnit" = 'mesghal' THEN
    NEW."priceUnit" := 'kg';
    NEW."purchasePrice" := round(NEW."purchasePrice" * 1000 / 4.608);
  END IF;
  IF NEW."unit" NOT IN ('g', 'kg', 'ml', 'l', 'tsp', 'tbsp', 'piece', 'dozen') THEN
    NEW."unit" := CASE btrim(NEW."unit")
      WHEN 'گرم'        THEN 'g'
      WHEN 'کیلوگرم'    THEN 'kg'
      WHEN 'کیلو'       THEN 'kg'
      WHEN 'میلی‌لیتر'  THEN 'ml'
      WHEN 'میلی لیتر'  THEN 'ml'
      WHEN 'سی‌سی'      THEN 'ml'
      WHEN 'لیتر'       THEN 'l'
      WHEN 'عدد'        THEN 'piece'
      WHEN 'دوجین'      THEN 'dozen'
      ELSE 'piece'
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- A recipe line remembers the unit its amount was typed in, for display only;
-- the amount itself is stored in the item's own unit. A restored line typed in
-- mesghal is shown in grams instead of failing the constraint above.
CREATE OR REPLACE FUNCTION "recipe_legacy_unit"() RETURNS trigger AS $$
BEGIN
  IF NEW."unit" = 'mesghal' THEN
    NEW."unit" := 'g';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "recipe_legacy_unit"
  BEFORE INSERT ON "ProductIngredient"
  FOR EACH ROW EXECUTE FUNCTION "recipe_legacy_unit"();
