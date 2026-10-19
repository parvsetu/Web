-- CreateTable
CREATE TABLE "programme_days" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "title" TEXT,
    "subtitle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "programme_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programme_items" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'PERFORMANCE',
    "description" TEXT,
    "setting" TEXT,
    "stage" TEXT,
    "language" TEXT,
    "ageLimit" TEXT,
    "videoUrl" TEXT,
    "posterKey" TEXT,
    "posterUpdatedAt" TIMESTAMP(3),
    "posterSizeBytes" INTEGER NOT NULL DEFAULT 0,
    "isHeadline" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "statusNote" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "programme_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programme_guests" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "bio" TEXT,
    "instagramUrl" TEXT,
    "photoKey" TEXT,
    "photoUpdatedAt" TIMESTAMP(3),
    "photoSizeBytes" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "programme_guests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "programme_days_eventId_date_key" ON "programme_days"("eventId", "date");

-- CreateIndex
CREATE INDEX "programme_items_eventId_date_idx" ON "programme_items"("eventId", "date");

-- CreateIndex
CREATE INDEX "programme_guests_itemId_idx" ON "programme_guests"("itemId");

-- AddForeignKey
ALTER TABLE "programme_days" ADD CONSTRAINT "programme_days_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programme_items" ADD CONSTRAINT "programme_items_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "programme_guests" ADD CONSTRAINT "programme_guests_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "programme_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

