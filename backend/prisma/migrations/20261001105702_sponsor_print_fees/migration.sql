-- AlterTable
ALTER TABLE "credit_transactions" ADD COLUMN     "sponsorFeePaise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sponsorIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "org_billing" ADD COLUMN     "sponsorPassFeePaise" INTEGER,
ADD COLUMN     "totalSponsorFeesPaise" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "sponsorPassFeePaise" INTEGER NOT NULL DEFAULT 50;

-- AlterTable
ALTER TABLE "sponsors" ADD COLUMN     "passesPrinted" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "printFeesPaise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "showOnPasses" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "tokens" ADD COLUMN     "sponsorIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
