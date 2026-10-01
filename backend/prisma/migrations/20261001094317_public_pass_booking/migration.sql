-- CreateEnum
CREATE TYPE "PassOrderStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'EXPIRED');

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "publicBookingEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "time_slots" ADD COLUMN     "price" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "pass_orders" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "timeSlotId" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "visitorCount" INTEGER NOT NULL,
    "buyerName" TEXT NOT NULL,
    "buyerMobile" TEXT NOT NULL,
    "buyerEmail" TEXT,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "PassOrderStatus" NOT NULL DEFAULT 'PENDING',
    "paymentProvider" TEXT NOT NULL,
    "providerOrderId" TEXT,
    "paymentReference" TEXT,
    "accessKey" TEXT NOT NULL,
    "tokenId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pass_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pass_orders_accessKey_key" ON "pass_orders"("accessKey");

-- CreateIndex
CREATE UNIQUE INDEX "pass_orders_tokenId_key" ON "pass_orders"("tokenId");

-- CreateIndex
CREATE INDEX "pass_orders_eventId_status_idx" ON "pass_orders"("eventId", "status");

-- CreateIndex
CREATE INDEX "pass_orders_timeSlotId_validFrom_status_idx" ON "pass_orders"("timeSlotId", "validFrom", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pass_orders_paymentProvider_providerOrderId_key" ON "pass_orders"("paymentProvider", "providerOrderId");

-- AddForeignKey
ALTER TABLE "pass_orders" ADD CONSTRAINT "pass_orders_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pass_orders" ADD CONSTRAINT "pass_orders_timeSlotId_fkey" FOREIGN KEY ("timeSlotId") REFERENCES "time_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pass_orders" ADD CONSTRAINT "pass_orders_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hand-written guards.
ALTER TABLE "time_slots" ADD CONSTRAINT "time_slots_price_nonnegative" CHECK ("price" >= 0);
ALTER TABLE "pass_orders" ADD CONSTRAINT "pass_orders_amount_nonnegative" CHECK ("amount" >= 0);
ALTER TABLE "pass_orders" ADD CONSTRAINT "pass_orders_visitor_count_positive" CHECK ("visitorCount" >= 1);
-- A PAID order always has its pass.
ALTER TABLE "pass_orders" ADD CONSTRAINT "pass_orders_paid_has_token" CHECK ("status" <> 'PAID' OR ("tokenId" IS NOT NULL AND "paidAt" IS NOT NULL));
