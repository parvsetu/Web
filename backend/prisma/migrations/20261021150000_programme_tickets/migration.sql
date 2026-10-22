-- Programme tickets: a programme item can be sold on its own (own price, capacity,
-- validity = the item's start–end on its date). A pass order is either a day pass
-- (time slot) or a programme ticket, never both.

-- AlterTable
ALTER TABLE "tokens" ADD COLUMN     "programmeItemId" TEXT;

-- AlterTable
ALTER TABLE "pass_orders" ADD COLUMN     "programmeItemId" TEXT,
ALTER COLUMN "timeSlotId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "programme_items" ADD COLUMN     "ticketCapacity" INTEGER,
ADD COLUMN     "ticketPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN     "ticketed" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "tokens_programmeItemId_idx" ON "tokens"("programmeItemId");

-- CreateIndex
CREATE INDEX "pass_orders_programmeItemId_status_idx" ON "pass_orders"("programmeItemId", "status");

-- AddForeignKey
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_programmeItemId_fkey" FOREIGN KEY ("programmeItemId") REFERENCES "programme_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pass_orders" ADD CONSTRAINT "pass_orders_programmeItemId_fkey" FOREIGN KEY ("programmeItemId") REFERENCES "programme_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Exactly one of the two booking targets.
ALTER TABLE "pass_orders" ADD CONSTRAINT "pass_orders_target_check"
  CHECK (("timeSlotId" IS NULL) <> ("programmeItemId" IS NULL));

ALTER TABLE "programme_items" ADD CONSTRAINT "programme_items_ticket_check"
  CHECK ("ticketPrice" >= 0 AND ("ticketCapacity" IS NULL OR "ticketCapacity" > 0));
