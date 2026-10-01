-- Rollback
DROP TABLE IF EXISTS "landing_purchases";
DROP TABLE IF EXISTS "landing_pages";
ALTER TABLE "org_billing" DROP CONSTRAINT IF EXISTS "org_billing_landing_price";
ALTER TABLE "org_billing" DROP COLUMN IF EXISTS "landingPageYearlyPricePaise";
ALTER TABLE "platform_settings" DROP CONSTRAINT IF EXISTS "platform_settings_landing_price";
ALTER TABLE "platform_settings" DROP COLUMN IF EXISTS "landingPageYearlyPricePaise";
