-- CreateEnum
CREATE TYPE "PriceRuleKind" AS ENUM ('DATES', 'WEEKENDS');

-- AlterTable
ALTER TABLE "pass_orders" ADD COLUMN     "priceRuleLabel" TEXT;

-- CreateTable
CREATE TABLE "price_rules" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "PriceRuleKind" NOT NULL,
    "dates" DATE[],
    "timeSlotIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fixedPricePaise" INTEGER,
    "upliftBps" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "price_rules_eventId_idx" ON "price_rules"("eventId");

-- AddForeignKey
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hand-written: integrity checks.
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_valid" CHECK (
  char_length("label") BETWEEN 1 AND 60
  AND (("fixedPricePaise" IS NULL) <> ("upliftBps" IS NULL))
  AND ("fixedPricePaise" IS NULL OR "fixedPricePaise" BETWEEN 0 AND 10000000)
  AND ("upliftBps" IS NULL OR "upliftBps" BETWEEN 1 AND 100000)
  AND (("kind" = 'DATES' AND cardinality(COALESCE("dates", '{}')) BETWEEN 1 AND 366) OR ("kind" = 'WEEKENDS' AND cardinality(COALESCE("dates", '{}')) = 0))
);
