-- Rollback (competition refund rows must go before the constraint is narrowed again)
DELETE FROM "payment_settlements" WHERE "sourceType" IN ('COMPETITION_ENTRY', 'COMPETITION_REFUND');
ALTER TABLE "payment_settlements" DROP CONSTRAINT IF EXISTS "payment_settlements_amounts";
ALTER TABLE "payment_settlements" ADD CONSTRAINT "payment_settlements_amounts" CHECK (
  "grossPaise" = "gatewayFeePaise" + "commissionPaise" + "netPaise"
  AND (
    ("sourceType" <> 'STALL_REFUND' AND "grossPaise" >= 0 AND "gatewayFeePaise" >= 0 AND "commissionPaise" >= 0 AND "netPaise" >= 0)
    OR ("sourceType" = 'STALL_REFUND' AND "grossPaise" < 0 AND "gatewayFeePaise" = 0 AND "commissionPaise" <= 0 AND "netPaise" <= 0)
  ));
DROP TABLE IF EXISTS "competition_entries";
DROP TABLE IF EXISTS "competition_categories";
DROP TABLE IF EXISTS "competitions";
ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_competition_seqs";
ALTER TABLE "events" DROP COLUMN IF EXISTS "competitionInvoiceSeq", DROP COLUMN IF EXISTS "competitionCreditNoteSeq";
ALTER TABLE "platform_settings" DROP CONSTRAINT IF EXISTS "platform_settings_competition_commission";
ALTER TABLE "platform_settings" DROP COLUMN IF EXISTS "competitionCommissionBps";
