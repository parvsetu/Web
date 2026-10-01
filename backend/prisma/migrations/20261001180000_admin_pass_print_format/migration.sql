-- AlterTable
ALTER TABLE "org_billing" ADD COLUMN     "passPrintFormat" TEXT;

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "defaultPassPrintFormat" TEXT NOT NULL DEFAULT 'AUTO';


ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_print_format" CHECK ("defaultPassPrintFormat" IN ('AUTO','A4','THERMAL_80','THERMAL_58'));
ALTER TABLE "org_billing" ADD CONSTRAINT "org_billing_print_format" CHECK ("passPrintFormat" IS NULL OR "passPrintFormat" IN ('AUTO','A4','THERMAL_80','THERMAL_58'));
