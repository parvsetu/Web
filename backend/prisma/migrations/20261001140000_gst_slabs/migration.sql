-- AlterTable
ALTER TABLE "events" ADD COLUMN     "gstLowRateBps" INTEGER NOT NULL DEFAULT 500,
ADD COLUMN     "gstMode" TEXT NOT NULL DEFAULT 'SLAB',
ADD COLUMN     "gstSlabThresholdPaise" INTEGER NOT NULL DEFAULT 10000;

ALTER TABLE "events" ADD CONSTRAINT "events_gst_slab_valid" CHECK ("gstMode" IN ('FLAT','SLAB') AND "gstLowRateBps" BETWEEN 0 AND 2800 AND "gstSlabThresholdPaise" > 0);
