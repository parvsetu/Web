-- Rollback
ALTER TABLE "org_billing" DROP CONSTRAINT IF EXISTS "org_billing_print_format";
ALTER TABLE "platform_settings" DROP CONSTRAINT IF EXISTS "platform_settings_print_format";
ALTER TABLE "org_billing" DROP COLUMN IF EXISTS "passPrintFormat";
ALTER TABLE "platform_settings" DROP COLUMN IF EXISTS "defaultPassPrintFormat";
