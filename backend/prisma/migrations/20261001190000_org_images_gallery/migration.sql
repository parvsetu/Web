-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "bannerKey" TEXT,
ADD COLUMN     "bannerUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "logoKey" TEXT,
ADD COLUMN     "logoUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "stored_images" (
    "key" TEXT NOT NULL,
    "organizationId" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "bytes" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stored_images_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "event_photos" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "imageKey" TEXT NOT NULL,
    "thumbKey" TEXT,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "caption" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "takenAt" TIMESTAMP(3),
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stored_images_organizationId_idx" ON "stored_images"("organizationId");

-- CreateIndex
CREATE INDEX "event_photos_eventId_createdAt_idx" ON "event_photos"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "event_photos_organizationId_createdAt_idx" ON "event_photos"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "event_photos_eventId_isPublic_idx" ON "event_photos"("eventId", "isPublic");

-- AddForeignKey
ALTER TABLE "stored_images" ADD CONSTRAINT "stored_images_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_photos" ADD CONSTRAINT "event_photos_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_photos" ADD CONSTRAINT "event_photos_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hand-written: integrity checks.
ALTER TABLE "stored_images" ADD CONSTRAINT "stored_images_valid" CHECK ("sizeBytes" > 0 AND "mimeType" IN ('image/png','image/jpeg','image/webp'));
ALTER TABLE "event_photos" ADD CONSTRAINT "event_photos_valid" CHECK (
  "sizeBytes" > 0 AND "width" > 0 AND "height" > 0
  AND "mimeType" IN ('image/png','image/jpeg','image/webp')
  AND ("caption" IS NULL OR char_length("caption") <= 300)
);

-- DB-backed ImageStore housekeeping: bytes go with their owner even when the
-- owner disappears through a cascade (org deleted, draft event deleted).
CREATE OR REPLACE FUNCTION event_photos_drop_images() RETURNS trigger AS $$
BEGIN
  DELETE FROM "stored_images" WHERE "key" = OLD."imageKey" OR "key" = OLD."thumbKey";
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "event_photos_drop_images" AFTER DELETE ON "event_photos" FOR EACH ROW EXECUTE FUNCTION event_photos_drop_images();
