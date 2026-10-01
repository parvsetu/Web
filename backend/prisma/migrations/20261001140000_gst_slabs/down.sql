-- Rollback
ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_gst_slab_valid", DROP COLUMN IF EXISTS "gstMode", DROP COLUMN IF EXISTS "gstSlabThresholdPaise", DROP COLUMN IF EXISTS "gstLowRateBps";
