-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "phoneSecondary" TEXT,
ADD COLUMN     "socialLinks" JSONB NOT NULL DEFAULT '[]';

-- Carry existing Instagram handles into the new footer.
--
-- The footer now reads `socialLinks` rather than the `instagram` column, so
-- without this every venue that had filled its Instagram in would quietly lose
-- the link the moment this shipped. The handle is normalised to the same shape
-- the settings form now writes: a bare handle with any leading @ removed.
--
-- `instagram` itself is deliberately left in place and untouched — dropping a
-- populated column in the same migration that starts reading a new one leaves
-- no way back if the new footer needs reverting.
UPDATE "Restaurant"
SET "socialLinks" = jsonb_build_array(
      jsonb_build_object(
        'platform', 'instagram',
        'url', ltrim(btrim("instagram"), '@')
      )
    )
WHERE "instagram" IS NOT NULL
  AND btrim("instagram") <> ''
  AND ltrim(btrim("instagram"), '@') <> '';
