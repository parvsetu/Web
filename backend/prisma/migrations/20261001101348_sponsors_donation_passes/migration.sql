-- CreateEnum
CREATE TYPE "SponsorTier" AS ENUM ('TITLE', 'PLATINUM', 'GOLD', 'SILVER', 'PARTNER');

-- AlterTable
ALTER TABLE "tokens" ADD COLUMN     "donationId" TEXT;

-- CreateTable
CREATE TABLE "sponsors" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "eventId" TEXT,
    "name" TEXT NOT NULL,
    "tier" "SponsorTier" NOT NULL DEFAULT 'PARTNER',
    "tagline" TEXT,
    "bannerText" TEXT,
    "websiteUrl" TEXT,
    "logo" BYTEA,
    "logoType" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sponsors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sponsors_organizationId_isActive_idx" ON "sponsors"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "sponsors_eventId_idx" ON "sponsors"("eventId");

-- AddForeignKey
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_donationId_fkey" FOREIGN KEY ("donationId") REFERENCES "donations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
