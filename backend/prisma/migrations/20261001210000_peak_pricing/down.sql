-- Rollback
DROP TABLE IF EXISTS "price_rules";
DROP TYPE IF EXISTS "PriceRuleKind";
ALTER TABLE "pass_orders" DROP COLUMN IF EXISTS "priceRuleLabel";
