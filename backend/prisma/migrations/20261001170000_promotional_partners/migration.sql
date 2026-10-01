-- CreateEnum
CREATE TYPE "PartnerStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PartnerCampaignStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'PAUSED', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PartnerTxType" AS ENUM ('RECHARGE', 'PASS_PRINT', 'REFUND', 'ADJUSTMENT');

-- AlterTable
ALTER TABLE "credit_transactions" ADD COLUMN     "partnerCampaignIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "tokens" ADD COLUMN     "partnerCampaignIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "partnerId" TEXT;

-- CreateTable
CREATE TABLE "partners" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "gstin" TEXT,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "websiteUrl" TEXT,
    "tagline" TEXT,
    "logo" BYTEA,
    "logoType" TEXT,
    "status" "PartnerStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "walletBalancePaise" INTEGER NOT NULL DEFAULT 0,
    "totalRechargedPaise" INTEGER NOT NULL DEFAULT 0,
    "totalSpentPaise" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_campaigns" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT,
    "message" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "maxPasses" INTEGER,
    "ratePaise" INTEGER NOT NULL,
    "status" "PartnerCampaignStatus" NOT NULL DEFAULT 'REQUESTED',
    "passesPrinted" INTEGER NOT NULL DEFAULT 0,
    "spentPaise" INTEGER NOT NULL DEFAULT 0,
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_wallet_transactions" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "type" "PartnerTxType" NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "balanceAfterPaise" INTEGER NOT NULL,
    "campaignId" TEXT,
    "organizationId" TEXT,
    "eventId" TEXT,
    "passOrderId" TEXT,
    "rechargeId" TEXT,
    "tokenCount" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_recharges" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "status" "PassOrderStatus" NOT NULL DEFAULT 'PENDING',
    "paymentProvider" TEXT NOT NULL,
    "providerOrderId" TEXT,
    "paymentReference" TEXT,
    "createdById" TEXT,
    "paidAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_recharges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "partners_status_createdAt_idx" ON "partners"("status", "createdAt");

-- CreateIndex
CREATE INDEX "partner_campaigns_organizationId_status_idx" ON "partner_campaigns"("organizationId", "status");

-- CreateIndex
CREATE INDEX "partner_campaigns_partnerId_createdAt_idx" ON "partner_campaigns"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX "partner_campaigns_status_createdAt_idx" ON "partner_campaigns"("status", "createdAt");

-- CreateIndex
CREATE INDEX "partner_wallet_transactions_partnerId_createdAt_idx" ON "partner_wallet_transactions"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX "partner_wallet_transactions_passOrderId_idx" ON "partner_wallet_transactions"("passOrderId");

-- CreateIndex
CREATE INDEX "partner_wallet_transactions_type_createdAt_idx" ON "partner_wallet_transactions"("type", "createdAt");

-- CreateIndex
CREATE INDEX "partner_recharges_partnerId_createdAt_idx" ON "partner_recharges"("partnerId", "createdAt");

-- CreateIndex
CREATE INDEX "users_partnerId_idx" ON "users"("partnerId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_campaigns" ADD CONSTRAINT "partner_campaigns_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_campaigns" ADD CONSTRAINT "partner_campaigns_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_campaigns" ADD CONSTRAINT "partner_campaigns_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_wallet_transactions" ADD CONSTRAINT "partner_wallet_transactions_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_recharges" ADD CONSTRAINT "partner_recharges_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Money invariants (database backstop behind the conditional UPDATEs).
ALTER TABLE "partners" ADD CONSTRAINT "partners_wallet_nonnegative" CHECK ("walletBalancePaise" >= 0);
ALTER TABLE "partners" ADD CONSTRAINT "partners_totals_nonnegative" CHECK ("totalRechargedPaise" >= 0 AND "totalSpentPaise" >= 0);
ALTER TABLE "partner_campaigns" ADD CONSTRAINT "partner_campaigns_valid" CHECK (
  "endDate" >= "startDate" AND "ratePaise" >= 0 AND char_length("message") BETWEEN 1 AND 120
  AND ("maxPasses" IS NULL OR "maxPasses" >= 1) AND "passesPrinted" >= 0 AND "spentPaise" >= 0
);
ALTER TABLE "partner_campaigns" ADD CONSTRAINT "partner_campaigns_cap" CHECK ("maxPasses" IS NULL OR "passesPrinted" <= "maxPasses");
ALTER TABLE "partner_recharges" ADD CONSTRAINT "partner_recharges_amount_positive" CHECK ("amountPaise" > 0);
