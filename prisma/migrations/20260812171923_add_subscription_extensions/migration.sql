-- CreateEnum
CREATE TYPE "ExtensionType" AS ENUM ('MANUAL', 'GIFT');

-- CreateTable
CREATE TABLE "SubscriptionExtension" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "adminEmail" TEXT NOT NULL,
    "extensionType" "ExtensionType" NOT NULL,
    "previousExpiration" TIMESTAMP(3) NOT NULL,
    "newExpiration" TIMESTAMP(3) NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionExtension_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SubscriptionExtension_subscriptionId_createdAt_idx" ON "SubscriptionExtension"("subscriptionId", "createdAt");

-- CreateIndex
CREATE INDEX "SubscriptionExtension_createdAt_idx" ON "SubscriptionExtension"("createdAt");

-- AddForeignKey
ALTER TABLE "SubscriptionExtension" ADD CONSTRAINT "SubscriptionExtension_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionExtension" ADD CONSTRAINT "SubscriptionExtension_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
