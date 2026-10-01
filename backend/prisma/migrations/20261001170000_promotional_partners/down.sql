-- Rollback
DROP TABLE IF EXISTS "partner_recharges", "partner_wallet_transactions", "partner_campaigns";
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_partnerId_fkey";
DROP INDEX IF EXISTS "users_partnerId_idx";
ALTER TABLE "users" DROP COLUMN IF EXISTS "partnerId";
DROP TABLE IF EXISTS "partners";
ALTER TABLE "tokens" DROP COLUMN IF EXISTS "partnerCampaignIds";
ALTER TABLE "credit_transactions" DROP COLUMN IF EXISTS "partnerCampaignIds";
DROP TYPE IF EXISTS "PartnerTxType";
DROP TYPE IF EXISTS "PartnerCampaignStatus";
DROP TYPE IF EXISTS "PartnerStatus";
