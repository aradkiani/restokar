-- A forgotten password is reset with a texted code. Its own purpose, so a
-- reset code can never be answered on the activation or sign-up screens, and
-- the challenge table says which flow a code belonged to.
ALTER TYPE "OtpPurpose" ADD VALUE 'RESET_PASSWORD';
