-- CreateEnum
CREATE TYPE "PayoutEntityType" AS ENUM ('REGISTERED', 'UNREGISTERED');

-- CreateEnum
CREATE TYPE "PayoutAccountStatus" AS ENUM ('PENDING', 'VERIFIED', 'NEEDS_CORRECTION', 'REJECTED');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('PENDING_PAYOUT', 'PAID_OUT');

-- AlterTable
ALTER TABLE "donations" ADD COLUMN     "shareKey" TEXT;

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "gatewayFeeBps" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "payout_accounts" (
    "organizationId" TEXT NOT NULL,
    "entityType" "PayoutEntityType" NOT NULL,
    "registeredType" TEXT,
    "legalName" TEXT NOT NULL,
    "registrationNumber" TEXT,
    "orgPanEnc" TEXT,
    "orgPanLast4" TEXT,
    "gstin" TEXT,
    "reg80G" TEXT,
    "reg12A" TEXT,
    "addressLine" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "pincode" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactRole" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "signatoryPanEnc" TEXT NOT NULL,
    "signatoryPanLast4" TEXT NOT NULL,
    "bankHolderName" TEXT NOT NULL,
    "bankAccountEnc" TEXT NOT NULL,
    "bankAccountLast4" TEXT NOT NULL,
    "ifsc" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "proof" BYTEA,
    "proofType" TEXT,
    "status" "PayoutAccountStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "gatewayAccountId" TEXT,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "submittedById" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_accounts_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "payment_settlements" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "grossPaise" INTEGER NOT NULL,
    "gatewayFeePaise" INTEGER NOT NULL,
    "commissionPaise" INTEGER NOT NULL,
    "netPaise" INTEGER NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'PENDING_PAYOUT',
    "payoutId" TEXT,
    "gatewayTransferId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payouts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payout_accounts_status_idx" ON "payout_accounts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_settlements_sourceId_key" ON "payment_settlements"("sourceId");

-- CreateIndex
CREATE INDEX "payment_settlements_organizationId_status_createdAt_idx" ON "payment_settlements"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "payouts_organizationId_paidAt_idx" ON "payouts"("organizationId", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "donations_shareKey_key" ON "donations"("shareKey");

-- AddForeignKey
ALTER TABLE "payout_accounts" ADD CONSTRAINT "payout_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_settlements" ADD CONSTRAINT "payment_settlements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_settlements" ADD CONSTRAINT "payment_settlements_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "payment_settlements" ADD CONSTRAINT "payment_settlements_amounts" CHECK (
  "grossPaise" >= 0 AND "gatewayFeePaise" >= 0 AND "commissionPaise" >= 0 AND "netPaise" >= 0
  AND "grossPaise" = "gatewayFeePaise" + "commissionPaise" + "netPaise");
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_amount_positive" CHECK ("amountPaise" > 0);
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_gateway_fee" CHECK ("gatewayFeeBps" BETWEEN 0 AND 10000);
