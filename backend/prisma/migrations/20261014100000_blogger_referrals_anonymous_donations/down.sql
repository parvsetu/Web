-- Rollback
DROP TABLE IF EXISTS "referral_ledger_entries";
DROP TABLE IF EXISTS "blogger_payouts";
ALTER TABLE "pass_orders" DROP CONSTRAINT IF EXISTS "pass_orders_referralPromotionId_fkey";
DROP INDEX IF EXISTS "pass_orders_referralPromotionId_idx";
ALTER TABLE "pass_orders" DROP COLUMN IF EXISTS "referralPromotionId";
DROP TABLE IF EXISTS "blogger_promotions";
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_bloggerId_fkey";
DROP INDEX IF EXISTS "users_bloggerId_idx";
ALTER TABLE "users" DROP COLUMN IF EXISTS "bloggerId";
DROP TABLE IF EXISTS "bloggers";
ALTER TABLE "platform_settings" DROP CONSTRAINT IF EXISTS "platform_settings_referral_commission";
ALTER TABLE "platform_settings" DROP COLUMN IF EXISTS "referralCommissionMode", DROP COLUMN IF EXISTS "referralCommissionValue";
-- Anonymous donations get a placeholder name so NOT NULL can come back.
ALTER TABLE "donations" DROP CONSTRAINT IF EXISTS "donations_anonymous_name";
UPDATE "donations" SET "donorName" = 'Anonymous' WHERE "donorName" IS NULL;
ALTER TABLE "donations" ALTER COLUMN "donorName" SET NOT NULL;
ALTER TABLE "donations" DROP COLUMN IF EXISTS "isAnonymous";
DROP TYPE IF EXISTS "ReferralLedgerType";
DROP TYPE IF EXISTS "PromotionStatus";
DROP TYPE IF EXISTS "BloggerStatus";
