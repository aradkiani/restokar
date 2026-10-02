-- What a subscription payment buys, fixed when checkout starts and applied to
-- the subscription only once the payment is verified. Additive; existing rows
-- keep NULL and the callback falls back to the subscription's own plan.
ALTER TABLE "Payment" ADD COLUMN "planId" TEXT,
ADD COLUMN "interval" TEXT,
ADD COLUMN "planSnapshot" JSONB;

-- A plan that has been paid for cannot be deleted, only hidden.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
