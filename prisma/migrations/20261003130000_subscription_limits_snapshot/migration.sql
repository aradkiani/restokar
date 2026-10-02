-- Each subscription remembers the limits of the period it paid for, so an
-- edit to a plan never changes an existing subscriber's current period. The
-- backfill copies every subscription's limits from its plan as they stand now
-- (after the legacy caps were lifted), so nothing changes for anyone today.
ALTER TABLE "Subscription" ADD COLUMN     "limitsSnapshot" JSONB;

UPDATE "Subscription" s
   SET "limitsSnapshot" = jsonb_build_object(
         'planCode', p."code",
         'maxProducts', p."maxProducts",
         'maxCategories', p."maxCategories",
         'maxTables', p."maxTables",
         'maxDailyViews', p."maxDailyViews",
         'allowsBranches', p."allowsBranches",
         'allowsOnlinePay', p."allowsOnlinePay",
         'allowsAnalytics', p."allowsAnalytics"
       )
  FROM "Plan" p
 WHERE p."id" = s."planId";
