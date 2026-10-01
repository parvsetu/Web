-- Rollback
DROP TABLE IF EXISTS "password_setup_tokens";
DROP TABLE IF EXISTS "agent_payouts";
DROP TABLE IF EXISTS "agent_ledger_entries";
DROP TABLE IF EXISTS "legal_declarations";
DROP TABLE IF EXISTS "event_fee_payments";
DROP TABLE IF EXISTS "event_fee_rates";
DROP TABLE IF EXISTS "custom_festival_types";
DROP TABLE IF EXISTS "mandal_registrations";
ALTER TABLE "users" DROP COLUMN IF EXISTS "agentId";
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "agentId", DROP COLUMN IF EXISTS "agentAttributedAt";
DROP TABLE IF EXISTS "agents";
ALTER TABLE "org_billing" DROP CONSTRAINT IF EXISTS "org_billing_event_fee_nonneg", DROP COLUMN IF EXISTS "eventFeePaise";
ALTER TABLE "platform_settings" DROP CONSTRAINT IF EXISTS "platform_settings_event_fee_nonneg",
  DROP COLUMN IF EXISTS "defaultEventFeePaise", DROP COLUMN IF EXISTS "agentReferralFeePaise", DROP COLUMN IF EXISTS "agentCommissionBps";
DROP INDEX IF EXISTS "events_approvalStatus_submittedAt_idx";
ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_fee_nonneg",
  DROP COLUMN IF EXISTS "approvalStatus", DROP COLUMN IF EXISTS "feeLegacy", DROP COLUMN IF EXISTS "feeQuotedPaise", DROP COLUMN IF EXISTS "feePaise",
  DROP COLUMN IF EXISTS "feeSource", DROP COLUMN IF EXISTS "submittedAt", DROP COLUMN IF EXISTS "submittedById", DROP COLUMN IF EXISTS "reviewedAt",
  DROP COLUMN IF EXISTS "reviewedById", DROP COLUMN IF EXISTS "reviewNote", DROP COLUMN IF EXISTS "liveAt", DROP COLUMN IF EXISTS "registrationId";
DROP TYPE IF EXISTS "AgentLedgerType";
DROP TYPE IF EXISTS "AgentStatus";
DROP TYPE IF EXISTS "EventFeeStatus";
DROP TYPE IF EXISTS "MandalRegistrationStatus";
DROP TYPE IF EXISTS "EventApprovalStatus";
