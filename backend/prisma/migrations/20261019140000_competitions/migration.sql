-- AlterTable
ALTER TABLE "events" ADD COLUMN     "competitionCreditNoteSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "competitionInvoiceSeq" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "competitionCommissionBps" INTEGER NOT NULL DEFAULT 500;

-- CreateTable
CREATE TABLE "competitions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'OTHER',
    "resultType" TEXT NOT NULL DEFAULT 'RANK',
    "description" TEXT,
    "rules" TEXT,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "venue" TEXT,
    "setting" TEXT,
    "lanes" INTEGER,
    "registrationOpen" BOOLEAN NOT NULL DEFAULT false,
    "registrationClosesAt" TIMESTAMP(3),
    "safetyDeclaration" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "resultsPublished" BOOLEAN NOT NULL DEFAULT false,
    "bibSeq" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competition_categories" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gender" TEXT NOT NULL DEFAULT 'ANY',
    "minAge" INTEGER,
    "maxAge" INTEGER,
    "feePaise" INTEGER NOT NULL DEFAULT 0,
    "capacity" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competition_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competition_entries" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "participantName" TEXT NOT NULL,
    "dateOfBirth" DATE NOT NULL,
    "ageOnDay" INTEGER NOT NULL,
    "gender" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "city" TEXT,
    "guardianName" TEXT,
    "guardianPhone" TEXT,
    "guardianConsentAt" TIMESTAMP(3),
    "emergencyName" TEXT NOT NULL,
    "emergencyPhone" TEXT NOT NULL,
    "declarationText" TEXT NOT NULL,
    "declarationAcceptedAt" TIMESTAMP(3) NOT NULL,
    "basePaise" INTEGER NOT NULL,
    "gstRateBps" INTEGER NOT NULL DEFAULT 0,
    "gstPaise" INTEGER NOT NULL DEFAULT 0,
    "amountPaise" INTEGER NOT NULL,
    "commissionBps" INTEGER NOT NULL,
    "platformFeePaise" INTEGER NOT NULL,
    "status" "PassOrderStatus" NOT NULL DEFAULT 'PENDING',
    "paymentProvider" TEXT NOT NULL,
    "providerOrderId" TEXT,
    "paymentReference" TEXT,
    "invoiceNo" TEXT,
    "accessKey" TEXT NOT NULL,
    "bibNo" INTEGER,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "checkedInAt" TIMESTAMP(3),
    "checkedInById" TEXT,
    "heat" INTEGER,
    "lane" INTEGER,
    "resultStatus" TEXT,
    "resultMs" INTEGER,
    "resultScore" DECIMAL(10,2),
    "rank" INTEGER,
    "resultNote" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelReason" TEXT,
    "refundPaise" INTEGER NOT NULL DEFAULT 0,
    "refundReference" TEXT,
    "creditNoteNo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competition_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "competitions_eventId_idx" ON "competitions"("eventId");

-- CreateIndex
CREATE INDEX "competition_categories_competitionId_idx" ON "competition_categories"("competitionId");

-- CreateIndex
CREATE UNIQUE INDEX "competition_entries_accessKey_key" ON "competition_entries"("accessKey");

-- CreateIndex
CREATE INDEX "competition_entries_categoryId_status_expiresAt_idx" ON "competition_entries"("categoryId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "competition_entries_competitionId_status_idx" ON "competition_entries"("competitionId", "status");

-- CreateIndex
CREATE INDEX "competition_entries_status_expiresAt_idx" ON "competition_entries"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "competition_entries_competitionId_bibNo_key" ON "competition_entries"("competitionId", "bibNo");

-- CreateIndex
CREATE UNIQUE INDEX "competition_entries_paymentProvider_providerOrderId_key" ON "competition_entries"("paymentProvider", "providerOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "competition_entries_eventId_invoiceNo_key" ON "competition_entries"("eventId", "invoiceNo");

-- AddForeignKey
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition_categories" ADD CONSTRAINT "competition_categories_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition_entries" ADD CONSTRAINT "competition_entries_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "competitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition_entries" ADD CONSTRAINT "competition_entries_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "competition_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─── Hand-written: integrity rules ─────────────────────────────────────
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_competition_commission" CHECK ("competitionCommissionBps" BETWEEN 0 AND 10000);
ALTER TABLE "events" ADD CONSTRAINT "events_competition_seqs" CHECK ("competitionInvoiceSeq" >= 0 AND "competitionCreditNoteSeq" >= 0);
ALTER TABLE "competitions" ADD CONSTRAINT "competitions_valid" CHECK (
  "resultType" IN ('TIME', 'SCORE', 'RANK') AND ("setting" IS NULL OR "setting" IN ('INDOOR', 'OUTDOOR'))
  AND ("lanes" IS NULL OR "lanes" BETWEEN 2 AND 12) AND "bibSeq" >= 0);
ALTER TABLE "competition_categories" ADD CONSTRAINT "competition_categories_valid" CHECK (
  "gender" IN ('ANY', 'MALE', 'FEMALE') AND "feePaise" >= 0 AND ("capacity" IS NULL OR "capacity" > 0)
  AND ("minAge" IS NULL OR "maxAge" IS NULL OR "minAge" <= "maxAge"));
-- Money on an entry always adds up; a refund only on a cancelled entry and never above what was paid.
ALTER TABLE "competition_entries" ADD CONSTRAINT "competition_entries_valid" CHECK (
  "basePaise" >= 0 AND "gstPaise" >= 0 AND "amountPaise" = "basePaise" + "gstPaise"
  AND "platformFeePaise" >= 0 AND "platformFeePaise" <= "basePaise"
  AND ("status"::text = 'CANCELLED') = ("cancelledAt" IS NOT NULL)
  AND "refundPaise" >= 0 AND "refundPaise" <= "amountPaise"
  AND ("refundPaise" = 0 OR "status"::text = 'CANCELLED')
  AND ("resultStatus" IS NULL OR "resultStatus" IN ('FINISHED', 'DNF', 'DNS', 'DQ'))
  AND ("rank" IS NULL OR "rank" > 0));
CREATE UNIQUE INDEX "competition_entries_event_credit_note_key" ON "competition_entries"("eventId", "creditNoteNo") WHERE "creditNoteNo" IS NOT NULL;

-- Competition refunds are negative settlement rows too (like STALL_REFUND).
ALTER TABLE "payment_settlements" DROP CONSTRAINT "payment_settlements_amounts";
ALTER TABLE "payment_settlements" ADD CONSTRAINT "payment_settlements_amounts" CHECK (
  "grossPaise" = "gatewayFeePaise" + "commissionPaise" + "netPaise"
  AND (
    ("sourceType" NOT IN ('STALL_REFUND', 'COMPETITION_REFUND') AND "grossPaise" >= 0 AND "gatewayFeePaise" >= 0 AND "commissionPaise" >= 0 AND "netPaise" >= 0)
    OR ("sourceType" IN ('STALL_REFUND', 'COMPETITION_REFUND') AND "grossPaise" < 0 AND "gatewayFeePaise" = 0 AND "commissionPaise" <= 0 AND "netPaise" <= 0)
  ));
