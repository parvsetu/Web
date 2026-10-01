DROP TABLE IF EXISTS "payment_settlements", "payouts", "payout_accounts";
DROP TYPE IF EXISTS "PayoutEntityType", "PayoutAccountStatus", "SettlementStatus";
ALTER TABLE "platform_settings" DROP COLUMN IF EXISTS "gatewayFeeBps";
ALTER TABLE "donations" DROP COLUMN IF EXISTS "shareKey";
