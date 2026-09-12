-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "pairingNote" TEXT,
ADD COLUMN     "pairingNoteEn" TEXT;

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "phoneCollectionEnabled" BOOLEAN NOT NULL DEFAULT false;
