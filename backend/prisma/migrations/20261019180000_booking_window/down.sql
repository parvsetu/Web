-- Rollback
ALTER TABLE "events" DROP CONSTRAINT IF EXISTS "events_booking_window";
ALTER TABLE "events" DROP COLUMN IF EXISTS "bookingOpensAt", DROP COLUMN IF EXISTS "bookingClosesAt";
