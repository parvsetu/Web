-- CreateEnum
CREATE TYPE "BloggerStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PromotionStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "ReferralLedgerType" AS ENUM ('EARNED', 'PAID', 'REVERSED');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "bloggerId" TEXT;

-- AlterTable
ALTER TABLE "donations" ADD COLUMN     "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "donorName" DROP NOT NULL;

-- AlterTable
ALTER TABLE "pass_orders" ADD COLUMN     "referralPromotionId" TEXT;

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "referralCommissionMode" TEXT NOT NULL DEFAULT 'PERCENT',
ADD COLUMN     "referralCommissionValue" INTEGER NOT NULL DEFAULT 500;

-- CreateTable
CREATE TABLE "bloggers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "city" TEXT,
    "bio" TEXT,
    "youtubeUrl" TEXT,
    "instagramHandle" TEXT,
    "blogUrl" TEXT,
    "audience" TEXT,
    "status" "BloggerStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bloggers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blogger_promotions" (
    "id" TEXT NOT NULL,
    "bloggerId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT,
    "status" "PromotionStatus" NOT NULL DEFAULT 'PENDING',
    "commissionMode" TEXT,
    "commissionValue" INTEGER,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blogger_promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_ledger_entries" (
    "id" TEXT NOT NULL,
    "bloggerId" TEXT NOT NULL,
    "type" "ReferralLedgerType" NOT NULL,
    "kind" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "promotionId" TEXT,
    "eventId" TEXT,
    "passOrderId" TEXT,
    "payoutId" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversesId" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "blogger_payouts" (
    "id" TEXT NOT NULL,
    "bloggerId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "paidOn" DATE NOT NULL,
    "reference" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blogger_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bloggers_status_createdAt_idx" ON "bloggers"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "blogger_promotions_code_key" ON "blogger_promotions"("code");

-- CreateIndex
CREATE INDEX "blogger_promotions_eventId_status_idx" ON "blogger_promotions"("eventId", "status");

-- CreateIndex
CREATE INDEX "blogger_promotions_status_createdAt_idx" ON "blogger_promotions"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "blogger_promotions_bloggerId_eventId_key" ON "blogger_promotions"("bloggerId", "eventId");

-- CreateIndex
CREATE INDEX "referral_ledger_entries_bloggerId_createdAt_idx" ON "referral_ledger_entries"("bloggerId", "createdAt");

-- CreateIndex
CREATE INDEX "referral_ledger_entries_promotionId_idx" ON "referral_ledger_entries"("promotionId");

-- CreateIndex
CREATE INDEX "referral_ledger_entries_passOrderId_idx" ON "referral_ledger_entries"("passOrderId");

-- CreateIndex
CREATE INDEX "blogger_payouts_bloggerId_paidOn_idx" ON "blogger_payouts"("bloggerId", "paidOn");

-- CreateIndex
CREATE INDEX "users_bloggerId_idx" ON "users"("bloggerId");

-- CreateIndex
CREATE INDEX "pass_orders_referralPromotionId_idx" ON "pass_orders"("referralPromotionId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_bloggerId_fkey" FOREIGN KEY ("bloggerId") REFERENCES "bloggers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pass_orders" ADD CONSTRAINT "pass_orders_referralPromotionId_fkey" FOREIGN KEY ("referralPromotionId") REFERENCES "blogger_promotions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blogger_promotions" ADD CONSTRAINT "blogger_promotions_bloggerId_fkey" FOREIGN KEY ("bloggerId") REFERENCES "bloggers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blogger_promotions" ADD CONSTRAINT "blogger_promotions_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_ledger_entries" ADD CONSTRAINT "referral_ledger_entries_bloggerId_fkey" FOREIGN KEY ("bloggerId") REFERENCES "bloggers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_ledger_entries" ADD CONSTRAINT "referral_ledger_entries_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "blogger_promotions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blogger_payouts" ADD CONSTRAINT "blogger_payouts_bloggerId_fkey" FOREIGN KEY ("bloggerId") REFERENCES "bloggers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Integrity rules ───────────────────────────────────────────────────

-- Anonymous donation ⇔ no stored name.
ALTER TABLE "donations" ADD CONSTRAINT "donations_anonymous_name"
  CHECK (("isAnonymous" AND "donorName" IS NULL) OR (NOT "isAnonymous" AND "donorName" IS NOT NULL));

ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_referral_commission"
  CHECK ("referralCommissionMode" IN ('PERCENT', 'FIXED') AND "referralCommissionValue" >= 0
         AND ("referralCommissionMode" = 'FIXED' OR "referralCommissionValue" <= 10000));

ALTER TABLE "blogger_promotions" ADD CONSTRAINT "blogger_promotions_commission"
  CHECK (("commissionMode" IS NULL AND "commissionValue" IS NULL)
      OR ("commissionMode" = 'PERCENT' AND "commissionValue" BETWEEN 0 AND 10000)
      OR ("commissionMode" = 'FIXED' AND "commissionValue" >= 0));
-- Only an approved (or later revoked) promotion has a code.
ALTER TABLE "blogger_promotions" ADD CONSTRAINT "blogger_promotions_code_when_approved"
  CHECK ("code" IS NULL OR "status" IN ('APPROVED', 'REVOKED'));

ALTER TABLE "referral_ledger_entries" ADD CONSTRAINT "referral_ledger_amount_pos" CHECK ("amountPaise" > 0);
ALTER TABLE "referral_ledger_entries" ADD CONSTRAINT "referral_ledger_kind" CHECK ("kind" IN ('COMMISSION', 'PAYOUT'));
ALTER TABLE "referral_ledger_entries" ADD CONSTRAINT "referral_ledger_shape" CHECK (
     ("type" = 'EARNED' AND "kind" = 'COMMISSION' AND "passOrderId" IS NOT NULL)
  OR ("type" = 'REVERSED' AND "kind" = 'COMMISSION' AND "reversesId" IS NOT NULL)
  OR ("type" = 'PAID' AND "kind" = 'PAYOUT' AND "payoutId" IS NOT NULL));
ALTER TABLE "blogger_payouts" ADD CONSTRAINT "blogger_payouts_amount_pos" CHECK ("amountPaise" > 0);

-- One commission per booking, ever (a reversed one is not re-earned), and one reversal per commission.
CREATE UNIQUE INDEX "referral_ledger_one_commission" ON "referral_ledger_entries"("passOrderId") WHERE "type" = 'EARNED';
CREATE UNIQUE INDEX "referral_ledger_one_reversal" ON "referral_ledger_entries"("reversesId") WHERE "type" = 'REVERSED';
