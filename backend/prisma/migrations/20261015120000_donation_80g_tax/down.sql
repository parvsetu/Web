-- Rollback
DROP TABLE IF EXISTS "form_10bd_filings";
DROP TABLE IF EXISTS "donation_documents";
DROP TABLE IF EXISTS "donation_tax_records";
DROP TABLE IF EXISTS "org_tax_profiles";
DROP TYPE IF EXISTS "TaxProfileStatus";
ALTER TABLE "platform_settings" DROP CONSTRAINT IF EXISTS "platform_settings_tax_rules";
ALTER TABLE "platform_settings" DROP COLUMN IF EXISTS "tax80GCashLimitPaise", DROP COLUMN IF EXISTS "tax10BDDueMonthDay";
