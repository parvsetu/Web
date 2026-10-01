-- Rollback
ALTER TABLE "events" DROP COLUMN IF EXISTS "venueAddress", DROP COLUMN IF EXISTS "venueLandmark", DROP COLUMN IF EXISTS "venuePincode", DROP COLUMN IF EXISTS "venueMapUrl", DROP COLUMN IF EXISTS "venueLat", DROP COLUMN IF EXISTS "venueLng", DROP COLUMN IF EXISTS "venueNotes", DROP COLUMN IF EXISTS "venueContactPhone";
