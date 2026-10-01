-- Orders can mint several passes (one QR per person). Move the existing
-- single-token link onto tokens.passOrderId before dropping the old column.
ALTER TABLE "tokens" ADD COLUMN "passOrderId" TEXT;
UPDATE "tokens" t SET "passOrderId" = o.id FROM "pass_orders" o WHERE o."tokenId" = t.id;
CREATE INDEX "tokens_passOrderId_idx" ON "tokens"("passOrderId");
ALTER TABLE "tokens" ADD CONSTRAINT "tokens_passOrderId_fkey" FOREIGN KEY ("passOrderId") REFERENCES "pass_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing orders were one group QR each.
ALTER TABLE "pass_orders" ADD COLUMN "perPersonPasses" BOOLEAN NOT NULL DEFAULT true;
UPDATE "pass_orders" SET "perPersonPasses" = false;

ALTER TABLE "pass_orders" DROP CONSTRAINT IF EXISTS "pass_orders_paid_has_token";
ALTER TABLE "pass_orders" DROP CONSTRAINT "pass_orders_tokenId_fkey";
DROP INDEX "pass_orders_tokenId_key";
ALTER TABLE "pass_orders" DROP COLUMN "tokenId";
ALTER TABLE "pass_orders" ADD CONSTRAINT "pass_orders_paid_has_time" CHECK ("status" <> 'PAID' OR "paidAt" IS NOT NULL);
