-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "fullDescriptionEn" TEXT,
ADD COLUMN     "shortDescriptionEn" TEXT;

-- AlterTable
ALTER TABLE "ProductInfoSection" ADD COLUMN     "contentEn" TEXT,
ADD COLUMN     "titleEn" TEXT;

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "bilingualEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "descriptionEn" TEXT,
ADD COLUMN     "staffCallLabelEn" TEXT,
ADD COLUMN     "taglineEn" TEXT;
