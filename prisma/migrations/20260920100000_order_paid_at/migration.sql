-- When an order's money actually arrived, so the board can retire an order an
-- hour after it is delivered *and* paid rather than an hour after delivery.
ALTER TABLE "Order" ADD COLUMN "paidAt" TIMESTAMP(3);

-- Backfill from the gateway's own verification time where there is one. An
-- online order that settled has a Payment row carrying the moment the bank
-- confirmed it, which is a better answer than anything derivable from the order.
UPDATE "Order" o
   SET "paidAt" = p."verifiedAt"
  FROM "Payment" p
 WHERE p."orderId" = o.id
   AND p.status = 'PAID'
   AND p."verifiedAt" IS NOT NULL
   AND o."paymentStatus" = 'PAID';

-- Cash bills have no Payment row. Fall back to delivery, then to when the order
-- was placed — both are already in the past, so a historical order settles into
-- "finished long ago" rather than reappearing on the pass as newly paid.
UPDATE "Order"
   SET "paidAt" = COALESCE("deliveredAt", "placedAt")
 WHERE "paymentStatus" = 'PAID'
   AND "paidAt" IS NULL;

-- The board asks "which orders are still live for this venue?" on every poll.
-- Without this it reads the tenant's whole order history to answer.
CREATE INDEX "Order_restaurantId_paymentStatus_paidAt_idx"
  ON "Order"("restaurantId", "paymentStatus", "paidAt");
