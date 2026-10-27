-- Pass-order refunds (organiser cancels a paid booking, or a ticketed programme is
-- cancelled), peak pricing for programme tickets, and the mandal set-up checklist.

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "passCreditNoteSeq" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "organization_members" ADD COLUMN     "setupChecklistDismissedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "pass_orders" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledById" TEXT,
ADD COLUMN     "creditNoteNo" TEXT,
ADD COLUMN     "refundPaise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "refundReference" TEXT,
ADD COLUMN     "refundedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "price_rules" ADD COLUMN     "appliesTo" TEXT NOT NULL DEFAULT 'SLOTS',
ADD COLUMN     "programmeItemIds" TEXT[] DEFAULT ARRAY[]::TEXT[];


-- A refund is never negative and never more than the order's amount.
ALTER TABLE "pass_orders" ADD CONSTRAINT "pass_orders_refund_check"
  CHECK ("refundPaise" >= 0 AND "refundPaise" <= ROUND("amount" * 100));

ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_applies_to_check"
  CHECK ("appliesTo" IN ('SLOTS', 'TICKETS', 'BOTH'));

-- Refund rows for pass orders are negative, like stall and competition refunds.
ALTER TABLE "payment_settlements" DROP CONSTRAINT "payment_settlements_amounts";
ALTER TABLE "payment_settlements" ADD CONSTRAINT "payment_settlements_amounts" CHECK (
  "grossPaise" = "gatewayFeePaise" + "commissionPaise" + "netPaise"
  AND (
    ("sourceType" NOT IN ('STALL_REFUND', 'COMPETITION_REFUND', 'PASS_REFUND') AND "grossPaise" >= 0 AND "gatewayFeePaise" >= 0 AND "commissionPaise" >= 0 AND "netPaise" >= 0)
    OR ("sourceType" IN ('STALL_REFUND', 'COMPETITION_REFUND', 'PASS_REFUND') AND "grossPaise" < 0 AND "gatewayFeePaise" = 0 AND "commissionPaise" <= 0 AND "netPaise" <= 0)
  ));
