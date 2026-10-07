-- CreateEnum
CREATE TYPE "VendorStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "StallCategory" AS ENUM ('FOOD', 'SHOPPING', 'SERVICES', 'EXHIBITOR', 'OTHER');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "vendorId" TEXT;

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "stallBookingEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stallGstRateBps" INTEGER NOT NULL DEFAULT 1800,
ADD COLUMN     "stallInvoiceSeq" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "stallCommissionBps" INTEGER NOT NULL DEFAULT 500;

-- AlterTable
ALTER TABLE "org_billing" ADD COLUMN     "stallCommissionBps" INTEGER;

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "category" "StallCategory",
    "description" TEXT,
    "city" TEXT,
    "gstin" TEXT,
    "status" "VendorStatus" NOT NULL DEFAULT 'ACTIVE',
    "statusNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stall_types" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "StallCategory" NOT NULL,
    "description" TEXT,
    "size" TEXT,
    "pricePaise" INTEGER NOT NULL,
    "totalCount" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stall_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stall_bookings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "stallTypeId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPricePaise" INTEGER NOT NULL,
    "basePaise" INTEGER NOT NULL,
    "gstRateBps" INTEGER NOT NULL DEFAULT 0,
    "gstPaise" INTEGER NOT NULL DEFAULT 0,
    "amountPaise" INTEGER NOT NULL,
    "commissionBps" INTEGER NOT NULL,
    "platformFeePaise" INTEGER NOT NULL,
    "businessName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "contactEmail" TEXT,
    "products" TEXT,
    "status" "PassOrderStatus" NOT NULL DEFAULT 'PENDING',
    "paymentProvider" TEXT NOT NULL,
    "providerOrderId" TEXT,
    "paymentReference" TEXT,
    "invoiceNo" TEXT,
    "stallNumbers" TEXT,
    "mandalNote" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stall_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendors_status_createdAt_idx" ON "vendors"("status", "createdAt");

-- CreateIndex
CREATE INDEX "stall_types_eventId_isActive_sortOrder_idx" ON "stall_types"("eventId", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "stall_bookings_stallTypeId_status_expiresAt_idx" ON "stall_bookings"("stallTypeId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "stall_bookings_vendorId_createdAt_idx" ON "stall_bookings"("vendorId", "createdAt");

-- CreateIndex
CREATE INDEX "stall_bookings_eventId_status_createdAt_idx" ON "stall_bookings"("eventId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "stall_bookings_status_expiresAt_idx" ON "stall_bookings"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "stall_bookings_paymentProvider_providerOrderId_key" ON "stall_bookings"("paymentProvider", "providerOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "stall_bookings_eventId_invoiceNo_key" ON "stall_bookings"("eventId", "invoiceNo");

-- CreateIndex
CREATE INDEX "users_vendorId_idx" ON "users"("vendorId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stall_types" ADD CONSTRAINT "stall_types_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stall_types" ADD CONSTRAINT "stall_types_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stall_bookings" ADD CONSTRAINT "stall_bookings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stall_bookings" ADD CONSTRAINT "stall_bookings_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stall_bookings" ADD CONSTRAINT "stall_bookings_stallTypeId_fkey" FOREIGN KEY ("stallTypeId") REFERENCES "stall_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stall_bookings" ADD CONSTRAINT "stall_bookings_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stall_bookings" ADD CONSTRAINT "stall_bookings_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Hand-written: integrity checks.
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_stall_commission" CHECK ("stallCommissionBps" BETWEEN 0 AND 10000);
ALTER TABLE "org_billing" ADD CONSTRAINT "org_billing_stall_commission" CHECK ("stallCommissionBps" IS NULL OR "stallCommissionBps" BETWEEN 0 AND 10000);
ALTER TABLE "events" ADD CONSTRAINT "events_stall_gst" CHECK ("stallGstRateBps" BETWEEN 0 AND 2800 AND "stallInvoiceSeq" >= 0);
ALTER TABLE "stall_types" ADD CONSTRAINT "stall_types_valid" CHECK (
  "pricePaise" >= 0 AND "totalCount" BETWEEN 0 AND 10000
  AND char_length("name") BETWEEN 1 AND 80
  AND ("description" IS NULL OR char_length("description") <= 500)
  AND ("size" IS NULL OR char_length("size") <= 40)
);
ALTER TABLE "stall_bookings" ADD CONSTRAINT "stall_bookings_valid" CHECK (
  "quantity" BETWEEN 1 AND 50
  AND "unitPricePaise" >= 0 AND "basePaise" = "unitPricePaise" * "quantity"
  AND "gstRateBps" BETWEEN 0 AND 2800 AND "gstPaise" >= 0
  AND "amountPaise" = "basePaise" + "gstPaise"
  AND "commissionBps" BETWEEN 0 AND 10000 AND "platformFeePaise" BETWEEN 0 AND "basePaise"
  AND ("status" <> 'PAID' OR "paidAt" IS NOT NULL)
);
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_valid" CHECK (
  char_length("businessName") BETWEEN 2 AND 120 AND char_length("contactName") BETWEEN 2 AND 100
  AND ("description" IS NULL OR char_length("description") <= 1000)
);
