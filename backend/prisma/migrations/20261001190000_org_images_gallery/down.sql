-- Rollback
DROP TRIGGER IF EXISTS "event_photos_drop_images" ON "event_photos";
DROP FUNCTION IF EXISTS event_photos_drop_images();
DROP TABLE IF EXISTS "event_photos";
DROP TABLE IF EXISTS "stored_images";
ALTER TABLE "organizations" DROP COLUMN IF EXISTS "logoKey", DROP COLUMN IF EXISTS "logoUpdatedAt", DROP COLUMN IF EXISTS "bannerKey", DROP COLUMN IF EXISTS "bannerUpdatedAt";
