-- Rollback (refund settlement rows must be removed first; the enum value stays — Postgres can't drop it)
DELETE FROM "payment_settlements" WHERE "sourceType" = 'STALL_REFUND';
ALTER TABLE "payment_settlements" DROP CONSTRAINT IF EXISTS "payment_settlements_amounts";
ALTER TABLE "payment_settlements" ADD CONSTRAINT "payment_settlements_amounts" CHECK (
  "grossPaise" >= 0 AND "gatewayFeePaise" >= 0 AND "commissionPaise" >= 0 AND "netPaise" >= 0
  AND "grossPaise" = "gatewayFeePaise" + "commissionPaise" + "netPaise");
DROP INDEX IF EXISTS "stall_bookings_event_credit_note_key";
ALTER TABLE "stall_bookings" DROP CONSTRAINT IF EXISTS "stall_bookings_cancellation";
ALTER TABLE "stall_bookings" DROP COLUMN IF EXISTS "cancelReason", DROP COLUMN IF EXISTS "cancelledAt", DROP COLUMN IF EXISTS "cancelledById",
  DROP COLUMN IF EXISTS "creditNoteNo", DROP COLUMN IF EXISTS "refundPaise", DROP COLUMN IF EXISTS "refundReference";
ALTER TABLE "events" DROP COLUMN IF EXISTS "stallCreditNoteSeq";
