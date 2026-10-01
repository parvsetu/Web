-- CreateEnum
CREATE TYPE "EventApprovalStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'CHANGES_REQUESTED', 'APPROVED_AWAITING_PAYMENT', 'LIVE', 'REJECTED');

-- CreateEnum
CREATE TYPE "MandalRegistrationStatus" AS ENUM ('PENDING_VERIFICATION', 'PENDING_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EventFeeStatus" AS ENUM ('PENDING', 'PAID', 'WAIVED', 'CANCELLED', 'EXPIRED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AgentLedgerType" AS ENUM ('EARNED', 'PAID', 'REVERSED');

-- AlterTable
-- Existing events keep working: the column is added as LIVE / legacy (treated as paid,
-- fee 0) for every current row, then the default switches to DRAFT for new events.
ALTER TABLE "events" ADD COLUMN     "approvalStatus" "EventApprovalStatus" NOT NULL DEFAULT 'LIVE',
ADD COLUMN     "feeLegacy" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "feePaise" INTEGER,
ADD COLUMN     "feeQuotedPaise" INTEGER,
ADD COLUMN     "feeSource" TEXT,
ADD COLUMN     "liveAt" TIMESTAMP(3),
ADD COLUMN     "registrationId" TEXT,
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "submittedAt" TIMESTAMP(3),
ADD COLUMN     "submittedById" TEXT;

UPDATE "events" SET "feePaise" = 0, "feeSource" = 'LEGACY', "liveAt" = "createdAt";
ALTER TABLE "events" ALTER COLUMN "approvalStatus" SET DEFAULT 'DRAFT';
ALTER TABLE "events" ALTER COLUMN "feeLegacy" SET DEFAULT false;

-- AlterTable
ALTER TABLE "org_billing" ADD COLUMN     "eventFeePaise" INTEGER;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "agentAttributedAt" TIMESTAMP(3),
ADD COLUMN     "agentId" TEXT;

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "agentCommissionBps" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "agentReferralFeePaise" INTEGER NOT NULL DEFAULT 20000,
ADD COLUMN     "defaultEventFeePaise" INTEGER NOT NULL DEFAULT 49900;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "agentId" TEXT;

-- CreateTable
CREATE TABLE "mandal_registrations" (
    "id" TEXT NOT NULL,
    "status" "MandalRegistrationStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "source" TEXT NOT NULL DEFAULT 'SELF',
    "orgName" TEXT NOT NULL,
    "state" TEXT,
    "city" TEXT,
    "address" TEXT,
    "contactName" TEXT NOT NULL,
    "contactMobile" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "applicantUserId" TEXT NOT NULL,
    "agentId" TEXT,
    "referralCode" TEXT,
    "events" JSONB NOT NULL,
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "organizationId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mandal_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_festival_types" (
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "description" TEXT,
    "defaultPrefix" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "inCatalog" BOOLEAN NOT NULL DEFAULT false,
    "organizationId" TEXT,
    "registrationId" TEXT,
    "createdById" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_festival_types_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "event_fee_rates" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "feePaise" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_fee_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_fee_payments" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "status" "EventFeeStatus" NOT NULL DEFAULT 'PENDING',
    "method" TEXT,
    "paymentProvider" TEXT,
    "providerOrderId" TEXT,
    "paymentReference" TEXT,
    "note" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "recordedById" TEXT,
    "refundedAt" TIMESTAMP(3),
    "refundReason" TEXT,
    "refundedById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_fee_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legal_declarations" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "registrationId" TEXT,
    "eventId" TEXT,
    "acceptedById" TEXT,
    "onBehalf" BOOLEAN NOT NULL DEFAULT false,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_declarations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agents" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'ACTIVE',
    "referralFeePaise" INTEGER,
    "commissionBps" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_ledger_entries" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "type" "AgentLedgerType" NOT NULL,
    "kind" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "organizationId" TEXT,
    "eventId" TEXT,
    "eventFeePaymentId" TEXT,
    "payoutId" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversesId" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_payouts" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "paidOn" DATE NOT NULL,
    "reference" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_setup_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_setup_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mandal_registrations_organizationId_key" ON "mandal_registrations"("organizationId");

-- CreateIndex
CREATE INDEX "mandal_registrations_status_createdAt_idx" ON "mandal_registrations"("status", "createdAt");

-- CreateIndex
CREATE INDEX "mandal_registrations_agentId_createdAt_idx" ON "mandal_registrations"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "mandal_registrations_applicantUserId_idx" ON "mandal_registrations"("applicantUserId");

-- CreateIndex
CREATE INDEX "custom_festival_types_inCatalog_idx" ON "custom_festival_types"("inCatalog");

-- CreateIndex
CREATE INDEX "custom_festival_types_organizationId_idx" ON "custom_festival_types"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "event_fee_rates_scope_key_key" ON "event_fee_rates"("scope", "key");

-- CreateIndex
CREATE UNIQUE INDEX "event_fee_payments_token_key" ON "event_fee_payments"("token");

-- CreateIndex
CREATE INDEX "event_fee_payments_eventId_createdAt_idx" ON "event_fee_payments"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "event_fee_payments_status_paidAt_idx" ON "event_fee_payments"("status", "paidAt");

-- CreateIndex
CREATE INDEX "legal_declarations_registrationId_idx" ON "legal_declarations"("registrationId");

-- CreateIndex
CREATE INDEX "legal_declarations_eventId_idx" ON "legal_declarations"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "agents_code_key" ON "agents"("code");

-- CreateIndex
CREATE INDEX "agent_ledger_entries_agentId_createdAt_idx" ON "agent_ledger_entries"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "agent_ledger_entries_organizationId_idx" ON "agent_ledger_entries"("organizationId");

-- CreateIndex
CREATE INDEX "agent_payouts_agentId_paidOn_idx" ON "agent_payouts"("agentId", "paidOn");

-- CreateIndex
CREATE UNIQUE INDEX "password_setup_tokens_tokenHash_key" ON "password_setup_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_setup_tokens_userId_idx" ON "password_setup_tokens"("userId");

-- CreateIndex
CREATE INDEX "events_approvalStatus_submittedAt_idx" ON "events"("approvalStatus", "submittedAt");

-- CreateIndex
CREATE INDEX "organizations_agentId_idx" ON "organizations"("agentId");

-- CreateIndex
CREATE INDEX "users_agentId_idx" ON "users"("agentId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mandal_registrations" ADD CONSTRAINT "mandal_registrations_applicantUserId_fkey" FOREIGN KEY ("applicantUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mandal_registrations" ADD CONSTRAINT "mandal_registrations_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mandal_registrations" ADD CONSTRAINT "mandal_registrations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_fee_payments" ADD CONSTRAINT "event_fee_payments_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_fee_payments" ADD CONSTRAINT "event_fee_payments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_declarations" ADD CONSTRAINT "legal_declarations_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "mandal_registrations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legal_declarations" ADD CONSTRAINT "legal_declarations_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_ledger_entries" ADD CONSTRAINT "agent_ledger_entries_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_ledger_entries" ADD CONSTRAINT "agent_ledger_entries_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_payouts" ADD CONSTRAINT "agent_payouts_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_setup_tokens" ADD CONSTRAINT "password_setup_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─── Hand-written integrity rules ───────────────────────────────────────
ALTER TABLE "events" ADD CONSTRAINT "events_fee_nonneg" CHECK (("feePaise" IS NULL OR "feePaise" >= 0) AND ("feeQuotedPaise" IS NULL OR "feeQuotedPaise" >= 0));
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_event_fee_nonneg"
  CHECK ("defaultEventFeePaise" >= 0 AND "agentReferralFeePaise" >= 0 AND "agentCommissionBps" BETWEEN 0 AND 10000);
ALTER TABLE "org_billing" ADD CONSTRAINT "org_billing_event_fee_nonneg" CHECK ("eventFeePaise" IS NULL OR "eventFeePaise" >= 0);
ALTER TABLE "event_fee_rates" ADD CONSTRAINT "event_fee_rates_scope" CHECK ("scope" IN ('TYPE', 'GROUP') AND "feePaise" >= 0);
ALTER TABLE "event_fee_payments" ADD CONSTRAINT "event_fee_payments_amount_nonneg" CHECK ("amountPaise" >= 0);
ALTER TABLE "event_fee_payments" ADD CONSTRAINT "event_fee_payments_method"
  CHECK ("method" IS NULL OR "method" IN ('ONLINE', 'CASH', 'BANK_TRANSFER', 'WAIVER'));
ALTER TABLE "event_fee_payments" ADD CONSTRAINT "event_fee_payments_paid_has_time" CHECK ("status" NOT IN ('PAID', 'WAIVED', 'REFUNDED') OR "paidAt" IS NOT NULL);
-- At most one settled (paid or waived) fee and one open pay link per event.
CREATE UNIQUE INDEX "event_fee_payments_one_settled" ON "event_fee_payments"("eventId") WHERE "status" IN ('PAID', 'WAIVED');
CREATE UNIQUE INDEX "event_fee_payments_one_pending" ON "event_fee_payments"("eventId") WHERE "status" = 'PENDING';
ALTER TABLE "mandal_registrations" ADD CONSTRAINT "mandal_registrations_source" CHECK ("source" IN ('SELF', 'AGENT'));
ALTER TABLE "custom_festival_types" ADD CONSTRAINT "custom_festival_types_status" CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED'));
ALTER TABLE "custom_festival_types" ADD CONSTRAINT "custom_festival_types_key" CHECK ("key" ~ '^[A-Z][A-Z0-9_]{1,40}$');
ALTER TABLE "legal_declarations" ADD CONSTRAINT "legal_declarations_target" CHECK ("registrationId" IS NOT NULL OR "eventId" IS NOT NULL);
ALTER TABLE "agents" ADD CONSTRAINT "agents_overrides" CHECK (("referralFeePaise" IS NULL OR "referralFeePaise" >= 0) AND ("commissionBps" IS NULL OR "commissionBps" BETWEEN 0 AND 10000));
ALTER TABLE "agent_ledger_entries" ADD CONSTRAINT "agent_ledger_amount_pos" CHECK ("amountPaise" > 0);
ALTER TABLE "agent_ledger_entries" ADD CONSTRAINT "agent_ledger_kind" CHECK ("kind" IN ('REGISTRATION', 'COMMISSION', 'PAYOUT'));
ALTER TABLE "agent_payouts" ADD CONSTRAINT "agent_payouts_amount_pos" CHECK ("amountPaise" > 0);
-- Idempotent earnings: one live registration referral per mandal, one commission per paid fee, one reversal per entry.
CREATE UNIQUE INDEX "agent_ledger_one_registration" ON "agent_ledger_entries"("organizationId") WHERE "kind" = 'REGISTRATION' AND "type" = 'EARNED' AND "reversedAt" IS NULL;
CREATE UNIQUE INDEX "agent_ledger_one_commission" ON "agent_ledger_entries"("eventFeePaymentId") WHERE "kind" = 'COMMISSION' AND "type" = 'EARNED';
CREATE UNIQUE INDEX "agent_ledger_one_reversal" ON "agent_ledger_entries"("reversesId") WHERE "type" = 'REVERSED';
