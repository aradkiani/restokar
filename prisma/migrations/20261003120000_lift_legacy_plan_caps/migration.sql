-- The retired starter/pro/enterprise plans still capped products and
-- categories (starter: 40 and 8) and starter blocked online payment, although
-- the current tiers carry neither cap and gate no features. Owner decision
-- (2026-10-02): lift those caps; table limits stay, since tables are what the
-- current pricing is based on.
--
-- Rollback (values before this migration):
--   starter:    maxProducts 40,  maxCategories 8,  allowsOnlinePay false
--   pro:        maxProducts 200, maxCategories 25, allowsOnlinePay true
--   enterprise: unchanged (already unlimited)
UPDATE "Plan"
   SET "maxProducts" = -1, "maxCategories" = -1, "allowsOnlinePay" = true
 WHERE "code" IN ('starter', 'pro', 'enterprise');
