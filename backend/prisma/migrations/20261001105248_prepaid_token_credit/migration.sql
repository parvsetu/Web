-- CreateEnum
CREATE TYPE "CreditTxType" AS ENUM ('RECHARGE', 'TOKEN_FEE', 'REFUND', 'ADJUSTMENT', 'WELCOME');

-- CreateTable
CREATE TABLE "platform_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "defaultTokenPricePaise" INTEGER NOT NULL DEFAULT 10000,
    "defaultCommissionBps" INTEGER NOT NULL DEFAULT 100,
    "lowCreditThresholdPaise" INTEGER NOT NULL DEFAULT 20000,
    "welcomeCreditPaise" INTEGER NOT NULL DEFAULT 10000,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "org_billing" (
    "organizationId" TEXT NOT NULL,
    "creditBalancePaise" INTEGER NOT NULL DEFAULT 0,
    "tokenPricePaise" INTEGER,
    "commissionBps" INTEGER,
    "lowCreditThresholdPaise" INTEGER,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "totalPersons" INTEGER NOT NULL DEFAULT 0,
    "totalFeesPaise" INTEGER NOT NULL DEFAULT 0,
    "totalRechargedPaise" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_billing_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "credit_transactions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "CreditTxType" NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "balanceAfterPaise" INTEGER NOT NULL,
    "eventId" TEXT,
    "source" TEXT,
    "tokenCount" INTEGER NOT NULL DEFAULT 0,
    "personCount" INTEGER NOT NULL DEFAULT 0,
    "unitFeePaise" INTEGER,
    "tokenPricePaise" INTEGER,
    "commissionBps" INTEGER,
    "reference" TEXT,
    "note" TEXT,
    "passOrderId" TEXT,
    "rechargeId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_recharges" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "status" "PassOrderStatus" NOT NULL DEFAULT 'PENDING',
    "paymentProvider" TEXT NOT NULL,
    "providerOrderId" TEXT,
    "paymentReference" TEXT,
    "createdById" TEXT,
    "paidAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_recharges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "credit_transactions_organizationId_createdAt_idx" ON "credit_transactions"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "credit_transactions_type_createdAt_idx" ON "credit_transactions"("type", "createdAt");

-- CreateIndex
CREATE INDEX "credit_transactions_passOrderId_idx" ON "credit_transactions"("passOrderId");

-- CreateIndex
CREATE INDEX "credit_recharges_organizationId_createdAt_idx" ON "credit_recharges"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "org_billing" ADD CONSTRAINT "org_billing_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_transactions" ADD CONSTRAINT "credit_transactions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_recharges" ADD CONSTRAINT "credit_recharges_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backend/DB-level enforcement: credit can never go negative, money never fractional.
ALTER TABLE "org_billing" ADD CONSTRAINT "org_billing_credit_nonnegative" CHECK ("creditBalancePaise" >= 0);
ALTER TABLE "org_billing" ADD CONSTRAINT "org_billing_overrides_valid" CHECK (
  ("tokenPricePaise" IS NULL OR "tokenPricePaise" >= 0) AND
  ("commissionBps" IS NULL OR ("commissionBps" >= 0 AND "commissionBps" <= 10000)) AND
  ("lowCreditThresholdPaise" IS NULL OR "lowCreditThresholdPaise" >= 0));
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_valid" CHECK (
  "defaultTokenPricePaise" >= 0 AND "defaultCommissionBps" BETWEEN 0 AND 10000 AND "lowCreditThresholdPaise" >= 0 AND "welcomeCreditPaise" >= 0);
ALTER TABLE "credit_recharges" ADD CONSTRAINT "credit_recharges_amount_positive" CHECK ("amountPaise" > 0);
INSERT INTO "platform_settings" ("id", "updatedAt") VALUES ('default', now()) ON CONFLICT DO NOTHING;
