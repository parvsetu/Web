ALTER TABLE "platform_settings" DROP COLUMN IF EXISTS "sponsorPassFeePaise";
ALTER TABLE "org_billing" DROP COLUMN IF EXISTS "sponsorPassFeePaise", DROP COLUMN IF EXISTS "totalSponsorFeesPaise";
ALTER TABLE "sponsors" DROP COLUMN IF EXISTS "showOnPasses", DROP COLUMN IF EXISTS "passesPrinted", DROP COLUMN IF EXISTS "printFeesPaise";
ALTER TABLE "tokens" DROP COLUMN IF EXISTS "sponsorIds";
ALTER TABLE "credit_transactions" DROP COLUMN IF EXISTS "sponsorFeePaise", DROP COLUMN IF EXISTS "sponsorIds";
