-- An account moving to a new sign-in number is an audited change, like a
-- password change was. Additive: an enum value, no data touched.
ALTER TYPE "AuditAction" ADD VALUE 'PHONE_CHANGED';
