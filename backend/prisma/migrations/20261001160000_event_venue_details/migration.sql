-- AlterTable
ALTER TABLE "events" ADD COLUMN     "venueAddress" TEXT,
ADD COLUMN     "venueContactPhone" TEXT,
ADD COLUMN     "venueLandmark" TEXT,
ADD COLUMN     "venueLat" DOUBLE PRECISION,
ADD COLUMN     "venueLng" DOUBLE PRECISION,
ADD COLUMN     "venueMapUrl" TEXT,
ADD COLUMN     "venueNotes" TEXT,
ADD COLUMN     "venuePincode" TEXT;

