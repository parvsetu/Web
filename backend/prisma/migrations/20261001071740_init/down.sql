-- Rollback for 20261001071740_init (Prisma has no automatic down migrations).
-- Apply with: npx prisma db execute --file prisma/migrations/20261001071740_init/down.sql
-- then: npx prisma migrate resolve --rolled-back 20261001071740_init
DROP TABLE IF EXISTS "audit_logs", "expenses", "donations", "scan_logs", "tokens", "visitors",
  "time_slots", "volunteer_applications", "event_assignments", "events", "organization_members",
  "role_permissions", "roles", "permissions", "organizations", "users" CASCADE;
DROP TYPE IF EXISTS "UserStatus", "MembershipStatus", "ApplicationStatus", "EventStatus",
  "TokenStatus", "ScanResult", "ScanMethod", "DonationMethod", "PaymentStatus";
