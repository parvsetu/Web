-- Rollback
DROP TABLE IF EXISTS "event_slug_aliases";
DROP INDEX IF EXISTS "events_slug_key";
ALTER TABLE "events" DROP COLUMN IF EXISTS "slug";
