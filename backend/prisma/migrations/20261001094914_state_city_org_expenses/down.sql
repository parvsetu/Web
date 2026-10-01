-- Rollback (mandal-wide expenses, i.e. eventId IS NULL, are deleted — export them first).
DELETE FROM "expenses" WHERE "eventId" IS NULL;
ALTER TABLE "expenses" DROP CONSTRAINT IF EXISTS "expenses_organizationId_fkey";
DROP INDEX IF EXISTS "expenses_organizationId_expenseDate_idx";
ALTER TABLE "expenses" DROP COLUMN IF EXISTS "organizationId", ALTER COLUMN "eventId" SET NOT NULL;
DROP INDEX IF EXISTS "events_state_city_idx";
ALTER TABLE "events" DROP COLUMN IF EXISTS "city", DROP COLUMN IF EXISTS "state";
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "state";
