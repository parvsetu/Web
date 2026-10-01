DROP INDEX IF EXISTS "pass_orders_event_invoice_key";
ALTER TABLE "pass_orders" DROP CONSTRAINT IF EXISTS "pass_orders_gst_sum", DROP COLUMN IF EXISTS "baseAmount", DROP COLUMN IF EXISTS "gstRateBps", DROP COLUMN IF EXISTS "gstAmount", DROP COLUMN IF EXISTS "gstBearer", DROP COLUMN IF EXISTS "invoiceNo";
ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_gst_valid", DROP COLUMN IF EXISTS "gstEnabled", DROP COLUMN IF EXISTS "gstRateBps", DROP COLUMN IF EXISTS "gstBearer", DROP COLUMN IF EXISTS "gstSac", DROP COLUMN IF EXISTS "passInvoiceSeq", DROP COLUMN IF EXISTS "passPrintFormat";
ALTER TABLE "payment_settlements" DROP COLUMN IF EXISTS "gstPaise";
