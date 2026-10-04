-- Dietary tags on dishes (spicy, vegetarian, contains nuts…). Keys from
-- src/lib/dish-tags.ts; existing dishes start untagged.
ALTER TABLE "Product" ADD COLUMN "dietaryTags" TEXT[] DEFAULT ARRAY[]::TEXT[];
