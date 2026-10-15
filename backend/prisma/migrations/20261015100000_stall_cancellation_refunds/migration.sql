-- AlterEnum
ALTER TYPE "PassOrderStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "stallCreditNoteSeq" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "stall_bookings" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "creditNoteNo" TEXT,
ADD COLUMN     "refundPaise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "refundReference" TEXT;

-- ─── Integrity rules ───────────────────────────────────────────────────
-- (status compared as text: the new enum value can't be referenced in the transaction that adds it)

ALTER TABLE "stall_bookings" ADD CONSTRAINT "stall_bookings_cancellation" CHECK (
  ("status"::text = 'CANCELLED') = ("cancelledAt" IS NOT NULL)
  AND "refundPaise" >= 0 AND "refundPaise" <= "amountPaise"
  AND ("refundPaise" = 0 OR "status"::text = 'CANCELLED'));
CREATE UNIQUE INDEX "stall_bookings_event_credit_note_key" ON "stall_bookings"("eventId", "creditNoteNo") WHERE "creditNoteNo" IS NOT NULL;

-- A refund is a NEGATIVE settlement row (sourceType STALL_REFUND, sourceId 'refund:<bookingId>'):
-- it hands back the platform fee pro rata and reduces the mandal's next payout. Every other row stays non-negative.
ALTER TABLE "payment_settlements" DROP CONSTRAINT "payment_settlements_amounts";
ALTER TABLE "payment_settlements" ADD CONSTRAINT "payment_settlements_amounts" CHECK (
  "grossPaise" = "gatewayFeePaise" + "commissionPaise" + "netPaise"
  AND (
    ("sourceType" <> 'STALL_REFUND' AND "grossPaise" >= 0 AND "gatewayFeePaise" >= 0 AND "commissionPaise" >= 0 AND "netPaise" >= 0)
    OR ("sourceType" = 'STALL_REFUND' AND "grossPaise" < 0 AND "gatewayFeePaise" = 0 AND "commissionPaise" <= 0 AND "netPaise" <= 0)
  ));
