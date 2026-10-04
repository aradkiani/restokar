-- A guest can ask for the bill as well as for the waiter.
CREATE TYPE "StaffCallKind" AS ENUM ('CALL', 'BILL');
ALTER TABLE "StaffCall" ADD COLUMN "kind" "StaffCallKind" NOT NULL DEFAULT 'CALL';
