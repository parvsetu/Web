-- AlterTable
ALTER TABLE "events" ADD COLUMN     "gstBearer" TEXT NOT NULL DEFAULT 'CUSTOMER',
ADD COLUMN     "gstEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "gstRateBps" INTEGER NOT NULL DEFAULT 1800,
ADD COLUMN     "gstSac" TEXT NOT NULL DEFAULT '9996',
ADD COLUMN     "passInvoiceSeq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "passPrintFormat" TEXT NOT NULL DEFAULT 'A4';

-- AlterTable
ALTER TABLE "pass_orders" ADD COLUMN     "baseAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "gstAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "gstBearer" TEXT,
ADD COLUMN     "gstRateBps" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "invoiceNo" TEXT;

-- AlterTable
ALTER TABLE "payment_settlements" ADD COLUMN     "gstPaise" INTEGER NOT NULL DEFAULT 0;


-- Existing orders: taxable value = amount (no GST was charged).
UPDATE "pass_orders" SET "baseAmount" = "amount" WHERE "baseAmount" = 0;
ALTER TABLE "events" ADD CONSTRAINT "events_gst_valid" CHECK ("gstRateBps" BETWEEN 0 AND 2800 AND "gstBearer" IN ('CUSTOMER','MANDAL') AND "passPrintFormat" IN ('A4','THERMAL_80','THERMAL_58'));
ALTER TABLE "pass_orders" ADD CONSTRAINT "pass_orders_gst_sum" CHECK ("amount" = "baseAmount" + "gstAmount");
CREATE UNIQUE INDEX "pass_orders_event_invoice_key" ON "pass_orders"("eventId", "invoiceNo");
