-- Rollback (keeps the first pass of each order as its single token).
ALTER TABLE "pass_orders" ADD COLUMN "tokenId" TEXT;
UPDATE "pass_orders" o SET "tokenId" = (SELECT t.id FROM "tokens" t WHERE t."passOrderId" = o.id ORDER BY t."tokenCode" LIMIT 1);
CREATE UNIQUE INDEX "pass_orders_tokenId_key" ON "pass_orders"("tokenId");
ALTER TABLE "pass_orders" ADD CONSTRAINT "pass_orders_tokenId_fkey" FOREIGN KEY ("tokenId") REFERENCES "tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pass_orders" DROP CONSTRAINT IF EXISTS "pass_orders_paid_has_time", DROP COLUMN "perPersonPasses";
ALTER TABLE "tokens" DROP CONSTRAINT "tokens_passOrderId_fkey", DROP COLUMN "passOrderId";
