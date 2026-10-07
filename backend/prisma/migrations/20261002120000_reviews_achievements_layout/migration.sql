-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'HIDDEN');

-- AlterTable
ALTER TABLE "landing_pages" ADD COLUMN     "layout" JSONB;

-- CreateTable
CREATE TABLE "visitor_reviews" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "passOrderId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "text" TEXT,
    "displayName" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "flagReasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "featuredAt" TIMESTAMP(3),
    "consentVersion" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "moderatedById" TEXT,
    "moderatedAt" TIMESTAMP(3),
    "moderationNote" TEXT,
    "reportCount" INTEGER NOT NULL DEFAULT 0,
    "autoHiddenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visitor_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_photos" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "imageKey" TEXT NOT NULL,
    "thumbKey" TEXT,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_reports" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "reporterHash" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievements" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "year" INTEGER,
    "awardedBy" TEXT,
    "description" TEXT,
    "icon" TEXT NOT NULL DEFAULT 'TROPHY',
    "imageKey" TEXT,
    "thumbKey" TEXT,
    "imageMimeType" TEXT,
    "imageSizeBytes" INTEGER NOT NULL DEFAULT 0,
    "imageUpdatedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "visitor_reviews_passOrderId_key" ON "visitor_reviews"("passOrderId");

-- CreateIndex
CREATE INDEX "visitor_reviews_organizationId_status_createdAt_idx" ON "visitor_reviews"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "visitor_reviews_eventId_status_createdAt_idx" ON "visitor_reviews"("eventId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "visitor_reviews_reportCount_idx" ON "visitor_reviews"("reportCount");

-- CreateIndex
CREATE INDEX "review_photos_reviewId_idx" ON "review_photos"("reviewId");

-- CreateIndex
CREATE INDEX "review_photos_organizationId_approved_createdAt_idx" ON "review_photos"("organizationId", "approved", "createdAt");

-- CreateIndex
CREATE INDEX "review_reports_reviewId_resolvedAt_idx" ON "review_reports"("reviewId", "resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "review_reports_reviewId_reporterHash_key" ON "review_reports"("reviewId", "reporterHash");

-- CreateIndex
CREATE INDEX "achievements_organizationId_sortOrder_idx" ON "achievements"("organizationId", "sortOrder");

-- AddForeignKey
ALTER TABLE "visitor_reviews" ADD CONSTRAINT "visitor_reviews_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitor_reviews" ADD CONSTRAINT "visitor_reviews_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visitor_reviews" ADD CONSTRAINT "visitor_reviews_passOrderId_fkey" FOREIGN KEY ("passOrderId") REFERENCES "pass_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_photos" ADD CONSTRAINT "review_photos_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "visitor_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_photos" ADD CONSTRAINT "review_photos_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "visitor_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hand-written: integrity checks.
ALTER TABLE "visitor_reviews" ADD CONSTRAINT "visitor_reviews_valid" CHECK (
  "rating" BETWEEN 1 AND 5
  AND ("text" IS NULL OR char_length("text") <= 500)
  AND char_length("displayName") BETWEEN 1 AND 40
  AND "reportCount" >= 0
  AND (NOT "featured" OR "status" = 'APPROVED')
  AND ("moderationNote" IS NULL OR char_length("moderationNote") <= 300)
);
ALTER TABLE "review_photos" ADD CONSTRAINT "review_photos_valid" CHECK (
  "sizeBytes" > 0 AND "width" > 0 AND "height" > 0
  AND "mimeType" IN ('image/png','image/jpeg','image/webp')
);
ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_valid" CHECK (
  "reason" IN ('SPAM','OFFENSIVE','FAKE','PRIVACY','OTHER')
  AND ("note" IS NULL OR char_length("note") <= 200)
);
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_valid" CHECK (
  char_length("title") BETWEEN 1 AND 120
  AND ("awardedBy" IS NULL OR char_length("awardedBy") <= 120)
  AND ("description" IS NULL OR char_length("description") <= 500)
  AND ("year" IS NULL OR "year" BETWEEN 1800 AND 2200)
  AND "icon" IN ('TROPHY','MEDAL','STAR','RIBBON','CERTIFICATE','CROWN')
  AND "imageSizeBytes" >= 0
  AND ("imageKey" IS NOT NULL OR "imageSizeBytes" = 0)
);
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_layout_array" CHECK ("layout" IS NULL OR jsonb_typeof("layout") = 'array');

-- DB-backed ImageStore housekeeping (same as event_photos): bytes go with their
-- owner even when it disappears through a cascade (review/org deleted).
CREATE OR REPLACE FUNCTION review_photos_drop_images() RETURNS trigger AS $$
BEGIN
  DELETE FROM "stored_images" WHERE "key" = OLD."imageKey" OR "key" = OLD."thumbKey";
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "review_photos_drop_images" AFTER DELETE ON "review_photos" FOR EACH ROW EXECUTE FUNCTION review_photos_drop_images();

CREATE OR REPLACE FUNCTION achievements_drop_images() RETURNS trigger AS $$
BEGIN
  IF OLD."imageKey" IS NOT NULL OR OLD."thumbKey" IS NOT NULL THEN
    DELETE FROM "stored_images" WHERE "key" = OLD."imageKey" OR "key" = OLD."thumbKey";
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "achievements_drop_images" AFTER DELETE ON "achievements" FOR EACH ROW EXECUTE FUNCTION achievements_drop_images();
