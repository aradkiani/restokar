-- Ingredient costing, exact prices and display rounding.
--
-- Additive: new columns only, every existing row backfilled so that nothing a
-- guest sees or pays changes when this runs. See src/lib/costing.ts.

-- ------------------------------------------------------------------ Product

-- The exact price, from which the shown/charged price is derived. Backfilled
-- from the current price before it becomes required, so on the day this runs
-- every dish's exact price *is* its price and rounding changes nothing.
ALTER TABLE "Product" ADD COLUMN "priceExact" DOUBLE PRECISION;
UPDATE "Product" SET "priceExact" = "price";
ALTER TABLE "Product" ALTER COLUMN "priceExact" SET NOT NULL;

ALTER TABLE "Product" ADD COLUMN "compareAtPriceExact" DOUBLE PRECISION;
UPDATE "Product" SET "compareAtPriceExact" = "compareAtPrice" WHERE "compareAtPrice" IS NOT NULL;

ALTER TABLE "Product" ADD COLUMN "costFromRecipe" BOOLEAN NOT NULL DEFAULT false;

-- A negative exact price has no meaning and would round to a negative charge.
ALTER TABLE "Product"
    ADD CONSTRAINT "Product_price_exact_non_negative"
    CHECK ("priceExact" >= 0 AND ("compareAtPriceExact" IS NULL OR "compareAtPriceExact" >= 0));

-- --------------------------------------------------------------- Restaurant

ALTER TABLE "Restaurant" ADD COLUMN "menuPriceStep" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Restaurant" ADD COLUMN "autoRepriceFromCost" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Restaurant" ADD COLUMN "lowMarginPercent" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "Restaurant"
    ADD CONSTRAINT "Restaurant_menu_price_step_non_negative" CHECK ("menuPriceStep" >= 0);
ALTER TABLE "Restaurant"
    ADD CONSTRAINT "Restaurant_low_margin_percent_range" CHECK ("lowMarginPercent" BETWEEN 0 AND 100);

-- ------------------------------------------------------------ InventoryItem

ALTER TABLE "InventoryItem" ADD COLUMN "purchasePrice" INTEGER;
ALTER TABLE "InventoryItem" ADD COLUMN "priceUnit" TEXT;
ALTER TABLE "InventoryItem" ADD COLUMN "priceUpdatedAt" TIMESTAMP(3);

-- `unit` was free text. It becomes a code from src/lib/units.ts. The labels
-- the old form suggested are mapped to their codes; the stored quantities are
-- thousandths of that same unit before and after, so no amount changes.
-- Anything unrecognised becomes a count — the one reading that never invents a
-- weight or a volume the owner did not state — and can be corrected in the UI.
UPDATE "InventoryItem" SET "unit" = CASE btrim("unit")
    WHEN 'گرم'        THEN 'g'
    WHEN 'g'          THEN 'g'
    WHEN 'کیلوگرم'    THEN 'kg'
    WHEN 'کیلو'       THEN 'kg'
    WHEN 'kg'         THEN 'kg'
    WHEN 'مثقال'      THEN 'mesghal'
    WHEN 'میلی‌لیتر'  THEN 'ml'
    WHEN 'میلی لیتر'  THEN 'ml'
    WHEN 'سی‌سی'      THEN 'ml'
    WHEN 'ml'         THEN 'ml'
    WHEN 'لیتر'       THEN 'l'
    WHEN 'l'          THEN 'l'
    WHEN 'عدد'        THEN 'piece'
    WHEN 'دوجین'      THEN 'dozen'
    ELSE 'piece'
END;

-- The catalogue, held the same way Campaign.targetSegment is: the application
-- defines the units, and this is the copy that holds whichever code path
-- writes the row.
ALTER TABLE "InventoryItem"
    ADD CONSTRAINT "InventoryItem_unit_known"
    CHECK ("unit" IN ('g', 'kg', 'mesghal', 'ml', 'l', 'tsp', 'tbsp', 'piece', 'dozen'));

-- A price needs both halves, is positive, and is quoted in a unit of the same
-- kind as the stock: "45,000 per litre" of flour would price nothing correctly.
ALTER TABLE "InventoryItem"
    ADD CONSTRAINT "InventoryItem_price_consistent"
    CHECK (
        ("purchasePrice" IS NULL AND "priceUnit" IS NULL)
        OR (
            "purchasePrice" > 0
            AND (
                ("unit" IN ('g', 'kg', 'mesghal') AND "priceUnit" IN ('g', 'kg', 'mesghal'))
                OR ("unit" IN ('ml', 'l', 'tsp', 'tbsp') AND "priceUnit" IN ('ml', 'l', 'tsp', 'tbsp'))
                OR ("unit" IN ('piece', 'dozen') AND "priceUnit" IN ('piece', 'dozen'))
            )
        )
    );

-- -------------------------------------------------------- ProductIngredient

-- The unit the amount was typed in, for display only.
ALTER TABLE "ProductIngredient" ADD COLUMN "unit" TEXT;
ALTER TABLE "ProductIngredient"
    ADD CONSTRAINT "ProductIngredient_unit_known"
    CHECK ("unit" IS NULL OR "unit" IN ('g', 'kg', 'mesghal', 'ml', 'l', 'tsp', 'tbsp', 'piece', 'dozen'));
