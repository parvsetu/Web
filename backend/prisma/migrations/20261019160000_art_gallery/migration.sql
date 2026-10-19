-- CreateTable
CREATE TABLE "artworks" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artistName" TEXT NOT NULL,
    "artistBio" TEXT,
    "artistInstagram" TEXT,
    "medium" TEXT,
    "widthCm" DECIMAL(7,1),
    "heightCm" DECIMAL(7,1),
    "depthCm" DECIMAL(7,1),
    "year" INTEGER,
    "description" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'DISPLAY',
    "pricePaise" INTEGER,
    "saleStatus" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "soldAt" TIMESTAMP(3),
    "imageKey" TEXT,
    "thumbKey" TEXT,
    "imageWidth" INTEGER,
    "imageHeight" INTEGER,
    "imageSizeBytes" INTEGER NOT NULL DEFAULT 0,
    "imageUpdatedAt" TIMESTAMP(3),
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artworks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "artwork_enquiries" (
    "id" TEXT NOT NULL,
    "artworkId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "artwork_enquiries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "artworks_eventId_isPublished_idx" ON "artworks"("eventId", "isPublished");

-- CreateIndex
CREATE INDEX "artworks_organizationId_idx" ON "artworks"("organizationId");

-- CreateIndex
CREATE INDEX "artwork_enquiries_eventId_status_createdAt_idx" ON "artwork_enquiries"("eventId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "artwork_enquiries_artworkId_idx" ON "artwork_enquiries"("artworkId");

-- AddForeignKey
ALTER TABLE "artworks" ADD CONSTRAINT "artworks_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "artwork_enquiries" ADD CONSTRAINT "artwork_enquiries_artworkId_fkey" FOREIGN KEY ("artworkId") REFERENCES "artworks"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─── Hand-written: integrity rules ─────────────────────────────────────
ALTER TABLE "artworks" ADD CONSTRAINT "artworks_valid" CHECK (
  "mode" IN ('DISPLAY', 'SALE') AND "saleStatus" IN ('AVAILABLE', 'RESERVED', 'SOLD')
  AND ("mode" = 'SALE' OR ("pricePaise" IS NULL AND "saleStatus" = 'AVAILABLE'))
  AND ("pricePaise" IS NULL OR "pricePaise" > 0)
  AND ("saleStatus" = 'SOLD') = ("soldAt" IS NOT NULL)
  AND "imageSizeBytes" >= 0);
ALTER TABLE "artwork_enquiries" ADD CONSTRAINT "artwork_enquiries_valid" CHECK ("status" IN ('NEW', 'CONTACTED', 'CLOSED'));
