-- AlterTable
ALTER TABLE "events" ADD COLUMN     "city" TEXT,
ADD COLUMN     "state" TEXT;

-- AlterTable: add nullable, backfill from the expense's event, then enforce.
ALTER TABLE "expenses" ADD COLUMN "organizationId" TEXT;
UPDATE "expenses" x SET "organizationId" = e."organizationId" FROM "events" e WHERE e.id = x."eventId";
ALTER TABLE "expenses" ALTER COLUMN "organizationId" SET NOT NULL,
ALTER COLUMN "eventId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "state" TEXT;

-- CreateIndex
CREATE INDEX "events_state_city_idx" ON "events"("state", "city");

-- CreateIndex
CREATE INDEX "expenses_organizationId_expenseDate_idx" ON "expenses"("organizationId", "expenseDate");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Copy existing mandal cities onto their festivals so filters work for old data.
UPDATE "events" e SET "city" = o."city" FROM "organizations" o WHERE o.id = e."organizationId" AND e."city" IS NULL;
