-- AlterEnum
-- Additive only: a new value on an existing enum. No table is rewritten, no
-- row is touched, and every existing audit entry keeps its action.
ALTER TYPE "AuditAction" ADD VALUE 'DATA_EXPORTED';
