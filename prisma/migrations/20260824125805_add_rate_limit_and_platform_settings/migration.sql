-- CreateTable
CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "PlatformSetting" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "backupEmail" TEXT,
    "lastBackupAt" TIMESTAMP(3),
    "lastBackupStatus" TEXT,
    "lastBackupError" TEXT,
    "lastBackupBytes" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RateLimit_resetAt_idx" ON "RateLimit"("resetAt");

-- CreateIndex
-- Backs the SetNull foreign keys on OrderItem.productId and Payment.subscriptionId.
-- Without these, deleting a product or a subscription sequentially scans the whole
-- child table. Additive and safe to apply online at this table size.
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

-- CreateIndex
CREATE INDEX "Payment_subscriptionId_idx" ON "Payment"("subscriptionId");

-- AlterEnum
-- Account creation mints a credential, so it belongs in the audit trail next to
-- the subscription grant. Additive: existing rows keep their values.
ALTER TYPE "AuditAction" ADD VALUE IF NOT EXISTS 'ACCOUNT_CREATED';
