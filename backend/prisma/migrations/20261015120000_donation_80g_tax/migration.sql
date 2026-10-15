-- CreateEnum
CREATE TYPE "TaxProfileStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'VERIFIED', 'REJECTED');

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "tax10BDDueMonthDay" TEXT NOT NULL DEFAULT '05-31',
ADD COLUMN     "tax80GCashLimitPaise" INTEGER NOT NULL DEFAULT 200000;

-- CreateTable
CREATE TABLE "org_tax_profiles" (
    "organizationId" TEXT NOT NULL,
    "urn" TEXT NOT NULL,
    "urnIssuedOn" DATE NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE,
    "orgPanEnc" TEXT NOT NULL,
    "orgPanLast4" TEXT NOT NULL,
    "sectionCode" TEXT NOT NULL DEFAULT 'Section 80G',
    "deductionPercent" INTEGER,
    "status" "TaxProfileStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "submittedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_tax_profiles_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "donation_tax_records" (
    "donationId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "idType" TEXT,
    "idNumberEnc" TEXT,
    "idLast4" TEXT,
    "donorIdHash" TEXT,
    "donorAddress" TEXT,
    "eligible" BOOLEAN NOT NULL DEFAULT false,
    "ineligibleReason" TEXT,
    "deductionPercent" INTEGER,
    "financialYear" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "donation_tax_records_pkey" PRIMARY KEY ("donationId")
);

-- CreateTable
CREATE TABLE "donation_documents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "donationId" TEXT,
    "financialYear" TEXT,
    "donorIdHash" TEXT,
    "docNo" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "snapshot" JSONB NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "closeReason" TEXT,

    CONSTRAINT "donation_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_10bd_filings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'FILED',
    "ackNumber" TEXT NOT NULL,
    "filedOn" DATE NOT NULL,
    "filedById" TEXT NOT NULL,
    "donorCount" INTEGER NOT NULL,
    "donationCount" INTEGER NOT NULL,
    "totalPaise" INTEGER NOT NULL,
    "donationIds" TEXT[],
    "revisionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_10bd_filings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "org_tax_profiles_status_idx" ON "org_tax_profiles"("status");

-- CreateIndex
CREATE INDEX "donation_tax_records_organizationId_financialYear_eligible_idx" ON "donation_tax_records"("organizationId", "financialYear", "eligible");

-- CreateIndex
CREATE INDEX "donation_tax_records_organizationId_financialYear_donorIdHa_idx" ON "donation_tax_records"("organizationId", "financialYear", "donorIdHash");

-- CreateIndex
CREATE INDEX "donation_documents_organizationId_kind_financialYear_idx" ON "donation_documents"("organizationId", "kind", "financialYear");

-- CreateIndex
CREATE INDEX "donation_documents_donationId_idx" ON "donation_documents"("donationId");

-- CreateIndex
CREATE INDEX "form_10bd_filings_organizationId_financialYear_idx" ON "form_10bd_filings"("organizationId", "financialYear");

-- AddForeignKey
ALTER TABLE "org_tax_profiles" ADD CONSTRAINT "org_tax_profiles_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "donation_tax_records" ADD CONSTRAINT "donation_tax_records_donationId_fkey" FOREIGN KEY ("donationId") REFERENCES "donations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Integrity rules ───────────────────────────────────────────────────

ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_tax_rules"
  CHECK ("tax80GCashLimitPaise" >= 0 AND "tax10BDDueMonthDay" ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$');
ALTER TABLE "org_tax_profiles" ADD CONSTRAINT "org_tax_profiles_rules"
  CHECK (("validTo" IS NULL OR "validTo" >= "validFrom")
     AND ("deductionPercent" IS NULL OR "deductionPercent" IN (50, 100))
     AND ("status" <> 'VERIFIED' OR "deductionPercent" IS NOT NULL));
ALTER TABLE "donation_tax_records" ADD CONSTRAINT "donation_tax_records_rules"
  CHECK (("idType" IS NULL) = ("idNumberEnc" IS NULL)
     AND ("idNumberEnc" IS NULL) = ("donorIdHash" IS NULL)
     AND ("idType" IS NULL OR "idType" IN ('PAN', 'AADHAAR', 'TIN', 'PASSPORT', 'VOTER_ID', 'DRIVING_LICENSE', 'RATION_CARD'))
     AND ("eligible" = ("ineligibleReason" IS NULL))
     AND (NOT "eligible" OR ("deductionPercent" IN (50, 100) AND "donorIdHash" IS NOT NULL))
     AND "financialYear" ~ '^\d{4}-\d{2}$');
ALTER TABLE "donation_documents" ADD CONSTRAINT "donation_documents_rules"
  CHECK ("kind" IN ('RECEIPT', 'FORM_10BE') AND "status" IN ('ISSUED', 'SUPERSEDED', 'CANCELLED') AND "version" >= 1
     AND ("kind" <> 'RECEIPT' OR "donationId" IS NOT NULL)
     AND ("kind" <> 'FORM_10BE' OR ("financialYear" IS NOT NULL AND "donorIdHash" IS NOT NULL)));
-- One live receipt per donation, one live 10BE per donor per year; versions never repeat.
CREATE UNIQUE INDEX "donation_documents_one_receipt" ON "donation_documents"("donationId") WHERE "kind" = 'RECEIPT' AND "status" = 'ISSUED';
CREATE UNIQUE INDEX "donation_documents_one_10be" ON "donation_documents"("organizationId", "financialYear", "donorIdHash") WHERE "kind" = 'FORM_10BE' AND "status" = 'ISSUED';
CREATE UNIQUE INDEX "donation_documents_receipt_version" ON "donation_documents"("donationId", "version") WHERE "kind" = 'RECEIPT';
CREATE UNIQUE INDEX "donation_documents_10be_version" ON "donation_documents"("organizationId", "financialYear", "donorIdHash", "version") WHERE "kind" = 'FORM_10BE';
ALTER TABLE "form_10bd_filings" ADD CONSTRAINT "form_10bd_filings_rules"
  CHECK ("status" IN ('FILED', 'REVISION_NEEDED', 'SUPERSEDED') AND "financialYear" ~ '^\d{4}-\d{2}$' AND "totalPaise" >= 0);
-- One current filing per mandal and year (corrections supersede the previous one).
CREATE UNIQUE INDEX "form_10bd_one_current" ON "form_10bd_filings"("organizationId", "financialYear") WHERE "status" <> 'SUPERSEDED';

-- Backfill: every existing donation gets a tax record (not eligible: no mandal has a verified 80G profile yet).
INSERT INTO "donation_tax_records" ("donationId", "organizationId", "eventId", "eligible", "ineligibleReason", "financialYear", "updatedAt")
SELECT d.id, e."organizationId", d."eventId", false,
  CASE WHEN d."paymentStatus" <> 'SUCCESS' THEN 'NOT_PAID' WHEN d."isAnonymous" THEN 'ANONYMOUS' ELSE 'NO_VERIFIED_80G' END,
  CASE WHEN EXTRACT(MONTH FROM d."donatedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata') >= 4
    THEN EXTRACT(YEAR FROM d."donatedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::int || '-' || lpad((((EXTRACT(YEAR FROM d."donatedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::int + 1) % 100))::text, 2, '0')
    ELSE (EXTRACT(YEAR FROM d."donatedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::int - 1) || '-' || lpad(((EXTRACT(YEAR FROM d."donatedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kolkata')::int % 100))::text, 2, '0')
  END,
  now()
FROM "donations" d JOIN "events" e ON e.id = d."eventId";
