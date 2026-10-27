ALTER TABLE "payment_settlements" DROP CONSTRAINT IF EXISTS "payment_settlements_amounts";
ALTER TABLE "payment_settlements" ADD CONSTRAINT "payment_settlements_amounts" CHECK (
  "grossPaise" = "gatewayFeePaise" + "commissionPaise" + "netPaise"
  AND (
    ("sourceType" NOT IN ('STALL_REFUND', 'COMPETITION_REFUND') AND "grossPaise" >= 0 AND "gatewayFeePaise" >= 0 AND "commissionPaise" >= 0 AND "netPaise" >= 0)
    OR ("sourceType" IN ('STALL_REFUND', 'COMPETITION_REFUND') AND "grossPaise" < 0 AND "gatewayFeePaise" = 0 AND "commissionPaise" <= 0 AND "netPaise" <= 0)
  ));
ALTER TABLE "price_rules" DROP CONSTRAINT IF EXISTS "price_rules_applies_to_check";
ALTER TABLE "pass_orders" DROP CONSTRAINT IF EXISTS "pass_orders_refund_check";
ALTER TABLE "price_rules" DROP COLUMN IF EXISTS "programmeItemIds", DROP COLUMN IF EXISTS "appliesTo";
ALTER TABLE "pass_orders" DROP COLUMN IF EXISTS "creditNoteNo", DROP COLUMN IF EXISTS "refundedAt", DROP COLUMN IF EXISTS "refundReference",
  DROP COLUMN IF EXISTS "refundPaise", DROP COLUMN IF EXISTS "cancelReason", DROP COLUMN IF EXISTS "cancelledById", DROP COLUMN IF EXISTS "cancelledAt";
ALTER TABLE "organization_members" DROP COLUMN IF EXISTS "setupChecklistDismissedAt";
ALTER TABLE "events" DROP COLUMN IF EXISTS "passCreditNoteSeq";
