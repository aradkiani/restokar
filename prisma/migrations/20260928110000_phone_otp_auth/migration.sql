-- Sign-in moves from email + password to phone + one-time SMS code.
--
-- Additive. Nothing is dropped: email and passwordHash become optional and are
-- no longer read, so no account loses data. User.phone becomes the unique
-- sign-in identifier, in one canonical form (09XXXXXXXXX, see
-- src/lib/phone.ts).
--
-- A database where two accounts share a number, or a number is not in that
-- form, is refused rather than guessed at. Deciding which account keeps a
-- number is the owner's call; on the development database it was made and
-- applied by scripts/assign-dev-phones.ts before this ran.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "User" WHERE "phone" IS NOT NULL GROUP BY "phone" HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'Some accounts share a phone number. Give each its own before making phone the sign-in identifier.';
  END IF;
  IF EXISTS (SELECT 1 FROM "User" WHERE "phone" IS NOT NULL AND "phone" !~ '^09[0-9]{9}$') THEN
    RAISE EXCEPTION 'Some account phone numbers are not in the 09XXXXXXXXX form. Normalise them first.';
  END IF;
END $$;

-- CreateEnum
CREATE TYPE "OtpPurpose" AS ENUM ('SIGNUP', 'LOGIN', 'CHANGE_PHONE');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "phoneVerifiedAt" TIMESTAMP(3),
ALTER COLUMN "email" DROP NOT NULL,
ALTER COLUMN "passwordHash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "OtpChallenge" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "purpose" "OtpPurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OtpChallenge_phone_purpose_createdAt_idx" ON "OtpChallenge"("phone", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX "OtpChallenge_expiresAt_idx" ON "OtpChallenge"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- AddForeignKey
ALTER TABLE "OtpChallenge" ADD CONSTRAINT "OtpChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- The one form normalisePhone produces for an Iranian mobile, held by the
-- database as well, so no path can store a number sign-in would never match.
ALTER TABLE "User"
    ADD CONSTRAINT "User_phone_mobile"
    CHECK ("phone" IS NULL OR "phone" ~ '^09[0-9]{9}$');
