-- AlterTable
ALTER TABLE "events" ADD COLUMN     "bookingClosesAt" TIMESTAMP(3),
ADD COLUMN     "bookingOpensAt" TIMESTAMP(3);


-- Hand-written: a window that closes before it opens is meaningless.
ALTER TABLE "events" ADD CONSTRAINT "events_booking_window" CHECK ("bookingOpensAt" IS NULL OR "bookingClosesAt" IS NULL OR "bookingClosesAt" > "bookingOpensAt");
