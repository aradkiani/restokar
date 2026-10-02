-- Plans become editable from the admin panel. Additive: new columns are NULL
-- or default, so every plan card renders as before. The one data change marks
-- tier-medium as recommended, which is the card the three pricing screens
-- already highlighted by position.
ALTER TABLE "Plan" ADD COLUMN     "descriptionEn" TEXT,
ADD COLUMN     "features" JSONB,
ADD COLUMN     "isRecommended" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "promoEndsAt" TIMESTAMP(3),
ADD COLUMN     "promoMonthlyPrice" INTEGER,
ADD COLUMN     "promoStartsAt" TIMESTAMP(3),
ADD COLUMN     "promoYearlyPrice" INTEGER,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "PlanVersion" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,

    CONSTRAINT "PlanVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlanVersion_planId_version_key" ON "PlanVersion"("planId", "version");

ALTER TABLE "PlanVersion" ADD CONSTRAINT "PlanVersion_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

UPDATE "Plan" SET "isRecommended" = true WHERE "code" = 'tier-medium';
