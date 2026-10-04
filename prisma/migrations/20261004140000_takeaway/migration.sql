-- Dine-in or takeaway. History stays dine-in; no venue offers takeaway
-- until its owner turns it on.
CREATE TYPE "ServiceType" AS ENUM ('DINE_IN', 'TAKEAWAY');
ALTER TABLE "Order" ADD COLUMN "serviceType" "ServiceType" NOT NULL DEFAULT 'DINE_IN';
ALTER TABLE "Restaurant" ADD COLUMN "takeawayEnabled" BOOLEAN NOT NULL DEFAULT false;
