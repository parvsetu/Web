-- Rollback
DROP TRIGGER IF EXISTS "achievements_drop_images" ON "achievements";
DROP FUNCTION IF EXISTS achievements_drop_images();
DROP TRIGGER IF EXISTS "review_photos_drop_images" ON "review_photos";
DROP FUNCTION IF EXISTS review_photos_drop_images();
DELETE FROM "stored_images" WHERE "key" IN (SELECT "imageKey" FROM "review_photos" UNION SELECT "thumbKey" FROM "review_photos" UNION SELECT "imageKey" FROM "achievements" UNION SELECT "thumbKey" FROM "achievements");
DROP TABLE IF EXISTS "review_reports";
DROP TABLE IF EXISTS "review_photos";
DROP TABLE IF EXISTS "visitor_reviews";
DROP TABLE IF EXISTS "achievements";
DROP TYPE IF EXISTS "ReviewStatus";
ALTER TABLE "landing_pages" DROP CONSTRAINT IF EXISTS "landing_pages_layout_array";
ALTER TABLE "landing_pages" DROP COLUMN IF EXISTS "layout";
