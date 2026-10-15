-- Rollback
DROP INDEX IF EXISTS "pass_orders_reminder_due";
DROP TABLE IF EXISTS "push_pass_links";
DROP TABLE IF EXISTS "push_subscriptions";
DROP TABLE IF EXISTS "push_keys";
ALTER TABLE "pass_orders" DROP COLUMN IF EXISTS "reminderSentAt";
