-- CreateEnum
CREATE TYPE "InstagramConnectionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "InstagramMediaStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "instagram_connections" (
    "organizationId" TEXT NOT NULL,
    "igUserId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "accountType" TEXT,
    "accessTokenEnc" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "status" "InstagramConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "connectedById" TEXT NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instagram_connections_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "instagram_media" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "igMediaId" TEXT NOT NULL,
    "parentIgId" TEXT,
    "caption" TEXT,
    "permalink" TEXT,
    "postedAt" TIMESTAMP(3),
    "status" "InstagramMediaStatus" NOT NULL DEFAULT 'PENDING',
    "imageKey" TEXT,
    "mimeType" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instagram_media_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "instagram_connections_status_tokenExpiresAt_idx" ON "instagram_connections"("status", "tokenExpiresAt");

-- CreateIndex
CREATE INDEX "instagram_connections_igUserId_idx" ON "instagram_connections"("igUserId");

-- CreateIndex
CREATE INDEX "instagram_media_organizationId_status_postedAt_idx" ON "instagram_media"("organizationId", "status", "postedAt");

-- CreateIndex
CREATE UNIQUE INDEX "instagram_media_organizationId_igMediaId_key" ON "instagram_media"("organizationId", "igMediaId");

-- AddForeignKey
ALTER TABLE "instagram_connections" ADD CONSTRAINT "instagram_connections_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instagram_media" ADD CONSTRAINT "instagram_media_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Integrity rules ───────────────────────────────────────────────────
-- An approved photo has its stored copy; nothing else holds bytes. An active connection has a token.
ALTER TABLE "instagram_media" ADD CONSTRAINT "instagram_media_rules" CHECK (
  ("status" = 'APPROVED') = ("imageKey" IS NOT NULL)
  AND ("imageKey" IS NULL OR ("mimeType" IS NOT NULL AND "width" > 0 AND "height" > 0 AND "sizeBytes" > 0))
  AND ("imageKey" IS NOT NULL OR "sizeBytes" = 0));
ALTER TABLE "instagram_connections" ADD CONSTRAINT "instagram_connections_token" CHECK (
  ("status" <> 'ACTIVE' OR "accessTokenEnc" IS NOT NULL) AND ("status" <> 'DISCONNECTED' OR "accessTokenEnc" IS NULL));
