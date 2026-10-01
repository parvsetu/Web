-- AlterTable
ALTER TABLE "org_billing" ADD COLUMN     "landingPageYearlyPricePaise" INTEGER;

-- AlterTable
ALTER TABLE "platform_settings" ADD COLUMN     "landingPageYearlyPricePaise" INTEGER NOT NULL DEFAULT 99900;

-- CreateTable
CREATE TABLE "landing_pages" (
    "organizationId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "paidUntil" TIMESTAMP(3),
    "headline" TEXT,
    "about" TEXT,
    "highlights" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "instagramUrl" TEXT,
    "facebookUrl" TEXT,
    "youtubeUrl" TEXT,
    "whatsappNumber" TEXT,
    "featuredEventIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "photoIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "themeColor" TEXT NOT NULL DEFAULT 'saffron',
    "totalPaidPaise" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "landing_pages_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "landing_purchases" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "years" INTEGER NOT NULL DEFAULT 1,
    "status" "PassOrderStatus" NOT NULL DEFAULT 'PENDING',
    "paymentProvider" TEXT NOT NULL,
    "providerOrderId" TEXT,
    "paymentReference" TEXT,
    "createdById" TEXT,
    "paidUntil" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "landing_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "landing_pages_paidUntil_idx" ON "landing_pages"("paidUntil");

-- CreateIndex
CREATE INDEX "landing_purchases_organizationId_createdAt_idx" ON "landing_purchases"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "landing_purchases_status_paidAt_idx" ON "landing_purchases"("status", "paidAt");

-- AddForeignKey
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landing_purchases" ADD CONSTRAINT "landing_purchases_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hand-written: integrity checks.
ALTER TABLE "platform_settings" ADD CONSTRAINT "platform_settings_landing_price" CHECK ("landingPageYearlyPricePaise" >= 0);
ALTER TABLE "org_billing" ADD CONSTRAINT "org_billing_landing_price" CHECK ("landingPageYearlyPricePaise" IS NULL OR "landingPageYearlyPricePaise" >= 0);
ALTER TABLE "landing_pages" ADD CONSTRAINT "landing_pages_valid" CHECK (
  cardinality("highlights") <= 6 AND cardinality("featuredEventIds") <= 50 AND cardinality("photoIds") <= 60
  AND "totalPaidPaise" >= 0
  AND "themeColor" IN ('saffron','crimson','marigold','peacock','emerald','royal','magenta','indigo')
);
ALTER TABLE "landing_purchases" ADD CONSTRAINT "landing_purchases_valid" CHECK ("amountPaise" > 0 AND "years" BETWEEN 1 AND 5);
