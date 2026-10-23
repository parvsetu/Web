-- CreateTable
CREATE TABLE "seo_pages" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT '',
    "lang" TEXT NOT NULL DEFAULT 'en',
    "name" TEXT,
    "title" TEXT,
    "metaDescription" TEXT,
    "aboveText" TEXT,
    "belowText" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seo_pages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "seo_pages_kind_key_lang_key" ON "seo_pages"("kind", "key", "lang");
