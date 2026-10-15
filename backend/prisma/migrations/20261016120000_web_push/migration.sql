-- AlterTable
ALTER TABLE "pass_orders" ADD COLUMN     "reminderSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "push_keys" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "publicKey" TEXT NOT NULL,
    "privateKeyEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userId" TEXT,
    "userAgent" TEXT,
    "lang" TEXT NOT NULL DEFAULT 'en',
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_pass_links" (
    "subscriptionId" TEXT NOT NULL,
    "passOrderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_pass_links_pkey" PRIMARY KEY ("subscriptionId","passOrderId")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_userId_idx" ON "push_subscriptions"("userId");

-- CreateIndex
CREATE INDEX "push_pass_links_passOrderId_idx" ON "push_pass_links"("passOrderId");

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_pass_links" ADD CONSTRAINT "push_pass_links_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "push_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "push_pass_links" ADD CONSTRAINT "push_pass_links_passOrderId_fkey" FOREIGN KEY ("passOrderId") REFERENCES "pass_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─── Integrity rules ───────────────────────────────────────────────────
-- One key pair only.
ALTER TABLE "push_keys" ADD CONSTRAINT "push_keys_single" CHECK ("id" = 'default');
-- Due reminders are found by validFrom among paid orders without one sent.
CREATE INDEX "pass_orders_reminder_due" ON "pass_orders"("validFrom") WHERE "status" = 'PAID' AND "reminderSentAt" IS NULL;
