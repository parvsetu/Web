-- Rollback: npx prisma db execute --file <this file>; npx prisma migrate resolve --rolled-back 20261001094317_public_pass_booking
DROP TABLE IF EXISTS "pass_orders";
DROP TYPE IF EXISTS "PassOrderStatus";
ALTER TABLE "time_slots" DROP CONSTRAINT IF EXISTS "time_slots_price_nonnegative", DROP COLUMN IF EXISTS "price";
ALTER TABLE "events" DROP COLUMN IF EXISTS "publicBookingEnabled";
