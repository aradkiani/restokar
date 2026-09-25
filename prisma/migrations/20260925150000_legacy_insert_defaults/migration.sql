-- Keeps rows written without the new costing columns valid.
--
-- The previous migration made "Product"."priceExact" required and constrained
-- "InventoryItem"."unit" to a catalogue of codes. Every path in the application
-- writes both correctly. Two paths outside it do not:
--
--   * scripts/backup-restore.ts inserts exactly the columns an archive holds,
--     and every archive taken before that migration holds no "priceExact" and
--     free-text units such as 'کیلوگرم'. Without this, restoring any older
--     backup fails on its first product — and a restore is the one operation
--     that must not fail, because it is run when something else already has.
--   * any hand-written SQL or older script that inserts a product the way the
--     schema used to allow.
--
-- Triggers rather than column defaults, because the default for an exact price
-- is another column of the same row, which a DEFAULT cannot express. They only
-- fill what is missing: a row that supplies its own values is written as sent.

CREATE OR REPLACE FUNCTION "product_exact_price_defaults"() RETURNS trigger AS $$
BEGIN
  IF NEW."priceExact" IS NULL THEN
    NEW."priceExact" := NEW."price";
  END IF;
  IF NEW."compareAtPriceExact" IS NULL AND NEW."compareAtPrice" IS NOT NULL THEN
    NEW."compareAtPriceExact" := NEW."compareAtPrice";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "product_exact_price_defaults"
  BEFORE INSERT ON "Product"
  FOR EACH ROW EXECUTE FUNCTION "product_exact_price_defaults"();

-- The same mapping the previous migration applied to existing rows, and the
-- same table as legacyUnitCode() in src/lib/units.ts. Unrecognised text becomes
-- a count, the one reading that never invents a weight or volume.
CREATE OR REPLACE FUNCTION "inventory_legacy_unit"() RETURNS trigger AS $$
BEGIN
  IF NEW."unit" NOT IN ('g', 'kg', 'mesghal', 'ml', 'l', 'tsp', 'tbsp', 'piece', 'dozen') THEN
    NEW."unit" := CASE btrim(NEW."unit")
      WHEN 'گرم'        THEN 'g'
      WHEN 'کیلوگرم'    THEN 'kg'
      WHEN 'کیلو'       THEN 'kg'
      WHEN 'مثقال'      THEN 'mesghal'
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

CREATE TRIGGER "inventory_legacy_unit"
  BEFORE INSERT ON "InventoryItem"
  FOR EACH ROW EXECUTE FUNCTION "inventory_legacy_unit"();
