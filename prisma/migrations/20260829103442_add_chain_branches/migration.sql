-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'BRANCH_MANAGER';

-- AlterTable
ALTER TABLE "Plan" ADD COLUMN     "allowsBranches" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isContractPriced" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "parentRestaurantId" TEXT;

-- AddForeignKey
ALTER TABLE "Restaurant" ADD CONSTRAINT "Restaurant_parentRestaurantId_fkey" FOREIGN KEY ("parentRestaurantId") REFERENCES "Restaurant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
