-- AlterTable
ALTER TABLE "events" ADD COLUMN     "slug" TEXT;

-- CreateTable
CREATE TABLE "event_slug_aliases" (
    "slug" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_slug_aliases_pkey" PRIMARY KEY ("slug")
);

-- CreateIndex
CREATE INDEX "event_slug_aliases_eventId_idx" ON "event_slug_aliases"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "events_slug_key" ON "events"("slug");

-- AddForeignKey
ALTER TABLE "event_slug_aliases" ADD CONSTRAINT "event_slug_aliases_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

