-- Rollback: npx prisma db execute --file <this file>; npx prisma migrate resolve --rolled-back 20261001073946_scan_request_fingerprint
ALTER TABLE "scan_logs" DROP COLUMN IF EXISTS "requestHash";
