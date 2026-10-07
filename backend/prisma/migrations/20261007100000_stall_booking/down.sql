-- Rollback
DROP TABLE IF EXISTS "stall_bookings";
DROP TABLE IF EXISTS "stall_types";
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_vendorId_fkey";
DROP INDEX IF EXISTS "users_vendorId_idx";
ALTER TABLE "users" DROP COLUMN IF EXISTS "vendorId";
DROP TABLE IF EXISTS "vendors";
ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_stall_gst";
ALTER TABLE "events" DROP COLUMN IF EXISTS "stallBookingEnabled", DROP COLUMN IF EXISTS "stallInvoiceSeq", DROP COLUMN IF EXISTS "stallGstRateBps";
ALTER TABLE "platform_settings" DROP CONSTRAINT IF EXISTS "platform_settings_stall_commission";
ALTER TABLE "platform_settings" DROP COLUMN IF EXISTS "stallCommissionBps";
ALTER TABLE "org_billing" DROP CONSTRAINT IF EXISTS "org_billing_stall_commission";
ALTER TABLE "org_billing" DROP COLUMN IF EXISTS "stallCommissionBps";
DROP TYPE IF EXISTS "StallCategory";
DROP TYPE IF EXISTS "VendorStatus";
