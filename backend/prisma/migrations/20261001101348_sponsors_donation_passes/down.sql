-- Rollback
DROP TABLE IF EXISTS "sponsors";
DROP TYPE IF EXISTS "SponsorTier";
ALTER TABLE "tokens" DROP CONSTRAINT IF EXISTS "tokens_donationId_fkey", DROP COLUMN IF EXISTS "donationId";
