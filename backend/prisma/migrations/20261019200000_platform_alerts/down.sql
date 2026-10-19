-- Rollback
ALTER TABLE "platform_settings" DROP COLUMN IF EXISTS "alertsCheckedAt", DROP COLUMN IF EXISTS "alertEmails";
