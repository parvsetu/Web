-- Rollback: npx prisma db execute --file <this file>; npx prisma migrate resolve --rolled-back <migration>
DROP TABLE IF EXISTS "email_otps";
DROP TYPE IF EXISTS "OtpPurpose";
ALTER TABLE "users" DROP COLUMN IF EXISTS "emailVerifiedAt", DROP COLUMN IF EXISTS "requiresEmailVerification";
