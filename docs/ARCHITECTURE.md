# Parvsetu — architecture & security notes

## Shape

```
            NestJS API  (/api/v1, JWT bearer, all business rules)
                 │
     ┌───────────┼───────────┐
  Next.js PWA   Android     iOS        ← thin clients, same API, no rules
     └───────────┼───────────┘
             PostgreSQL (Prisma)
```

Clients render state and send intents. They never decide a scan verdict,
never compute authoritative permissions, and never mark anything used locally.
A future native app needs only the HTTP contract in `docs/API.md`.

## Tenancy & data model

`Organization` (mandal) → `Event` (one festival edition, e.g. "Durga Puja
2026"). Festival type is a free string with presets, so a new festival needs
no code change. Every operational row carries `eventId`: `Token`, `TimeSlot`,
`Visitor`, `ScanLog`, `Donation`, `Expense`. A user can belong to any number
of orgs and events.

## Authorization (three inputs, all server-side)

```
effective(event) = ACTIVE OrganizationMember.role.permissions  (org-wide)
                 ∪ ACTIVE EventAssignment.role.permissions     (this event only)
super admin      = all permissions
```

- `AccessService` is the only place this is computed. `PermissionGuard`
  applies `@RequireEventPermission(...)` / `@RequireOrgPermission(...)` /
  `@SuperAdminOnly()` declaratively and attaches the result as
  `request.access` (handlers use it for finer checks, e.g. withholding
  financial blocks from a summary).
- Roles are rows (`Role` + `RolePermission`). The permission catalog and the
  six system roles live in `backend/src/common/permissions.ts`, and the seed
  syncs them into the database. Orgs can create custom roles; system roles can't
  be edited through the API.
- The JWT holds only `{ sub, ver }`. The user, status and roles are re-read on
  every request. Disabling a user or changing their password bumps `tokenVersion`, which
  revokes their sessions.
- **Escalation guard**: you can only grant (or edit someone holding) a role
  whose permissions are a subset of your own at that scope. Nobody can change
  their own role or status, or approve their own application.
- **Isolation**: a user with zero permissions on an event/org gets **404**
  (existence isn't disclosed). Every by-id lookup is scoped by the URL's
  `eventId` (`findFirst({ id, eventId })`), so another event's ids can't be
  addressed through your own event.

## Single-use tokens: the guarantee

`ScanService.scan` (`backend/src/modules/tokens/scan.service.ts`):

1. **Atomic redemption.** One conditional statement decides the outcome:
   `UPDATE tokens SET status='USED', usedAt, usedById WHERE id AND eventId AND
   status='ACTIVE' AND validFrom<=now AND validUntil>now`. Postgres row-locks
   the token. A concurrent second UPDATE waits, then re-checks the WHERE
   against the committed row and matches 0 rows. There is no read-then-write
   gap.
2. **Database backstop.** The partial unique index
   `scan_logs_one_success_per_token (tokenId) WHERE result='SUCCESS' AND
   voidedAt IS NULL` is written in the init migration. The SUCCESS log row is
   inserted in the same transaction as the UPDATE, so even a hypothetical
   double-redeem would fail and roll back. CHECK constraints keep the token
   row self-consistent: a USED token has `usedAt`, and `validUntil > validFrom`.
3. **Idempotent retries.** `(userId, idempotencyKey)` is unique on
   `scan_logs`. A retried request replays the stored verdict
   (`replayed: true`). A `requestHash` (sha256 of event + payload) ensures a
   replay is only served for the identical request. A reused key on a
   different token gets 409, never a stale "entry allowed".
4. **Classification after a refusal.** The refusal reason comes from the
   committed row: CANCELLED → ALREADY_USED → EXPIRED → NOT_YET_VALID.
   - **Deviation from the spec's order:** a token that is both used *and*
     past its window is reported as ALREADY_USED rather than EXPIRED. That is
     the more useful and more security-relevant answer.

Validation order otherwise follows the spec:
1. Authenticated (JWT guard).
2. TOKEN_SCAN on the event, plus TOKEN_MANUAL_ENTRY for typed codes.
3. Event ACTIVE.
4. QR signature verified *before* any DB lookup.
5. Token exists.
6. Token belongs to the event.
7. Atomic redeem.
8. Log.

Every attempt is logged, including UNAUTHORIZED. A WRONG_EVENT log is not
linked to the other event's token, so that event's history never shows a
foreign scanner.

### QR payload

`PSQR1.<secureToken>.<sig>`:
- `secureToken` is 128-bit random, stored with a unique index.
- `sig` is HMAC-SHA256(`QR_SIGNING_SECRET`, secureToken), truncated to 128
  bits.

The payload carries no personal data. Forged or enumerated payloads are
rejected without touching the DB. A DB dump alone can't mint QRs. The signature is
recomputable, so QRs can be re-printed (`GET …/tokens/:id/qr.png`). The
human-readable `tokenCode` (`DUR-2026-000123`) is sequential, so typing it
needs the separate `TOKEN_MANUAL_ENTRY` permission and is scoped to the
scanner's own event.

### Validity windows

`TimeSlot` is a daily template (`HH:mm`–`HH:mm`, in the event timezone; an end
at or before the start crosses midnight; optional capacity). Issuing a token
for (slot, date) copies a concrete UTC `validFrom/validUntil` onto the token.
Editing a slot never silently changes tokens already in visitors' hands.
Per-token overrides:
- Custom windows at issue time need TOKEN_GENERATE.
- `PATCH …/validity` needs a reason and is audited.

EXPIRED is derived, not stored, so extending a window never needs an
"un-expire".

### Recovery

`POST …/tokens/:id/reactivate` is the only USED → ACTIVE path. It needs:
- the TOKEN_REACTIVATE permission;
- a reason of at least 10 characters;
- the token code typed back as confirmation.

It voids (doesn't delete) the old SUCCESS log and writes an audit row. After
that, exactly one new entry is possible.

## Audit

- `AuditLog` (who, what, when, org, event, before, after, reason) is written
  *inside the same transaction* as the change. It covers:
  - roles, members, assignments, volunteer create/(de)activate/approve/reject;
  - events and slots;
  - token cancel/validity/reactivate/bulk generation;
  - donations, expenses, platform user changes.
- Gate activity lives in `ScanLog`. Reports and volunteer activity are
  computed from it at read time, with no maintained counters.

## Payments

`PaymentProvider` interface (`modules/donations/payment-provider.ts`):
- `createPayment` → SUCCESS (money in hand) or PENDING plus checkout info.
- `parseWebhook` verifies the provider's signature over the raw body.

Two providers are registered:
- `manual` (cash/UPI received);
- `mock`, a signed-webhook demo gateway that is dev only and refused in
  production.

Adding Razorpay or similar is one new class in `buildProviders()`. Receipt
numbers come from an atomic per-event counter and are assigned only once
payment is confirmed.

## Promotional partners

Brands (`Partner`) are a platform-level tenant beside mandals: a partner user has `User.partnerId` and no
memberships, so `AccessService` gives it nothing on any org/event (404), and `/partner/*` routes go through
`PartnerGuard` (read vs write by partner status). Only the super admin approves partner accounts and campaigns.

Money flow: a brand prepays a wallet (`partners.walletBalancePaise`, CHECK >= 0, ledger in
`partner_wallet_transactions`). `BillingService.charge` — called in the same transaction as every pass — first
debits the mandal's commission (org row lock; 402 if short), then `PartnerBillingService.charge` prints up to two
eligible campaigns: lock partner rows (sorted by id), then campaign rows (sorted by id), conditional wallet debit,
conditional campaign increment (status + cap), compensate the debit if the increment fails. A partner can only
ever be *skipped*; it never fails the pass. The fixed lock order (org → partners → campaigns, also used by order
refunds) keeps concurrent issuers across mandals sharing one brand deadlock-free. Printed campaign ids are
snapshotted on the token and on the held credit row (online orders mint at payment time and refund on
failure/expiry, once). The mandal is no longer charged for printing its own sponsors. Pass print layout is a
platform setting per mandal (`AUTO` = A4 with 2+ ads), resolved server-side per pass.

## Images (logo, banner, festival photos)

All image bytes go through one small interface, `ImageStore` (`backend/src/common/images/image-store.ts`):
`put({ prefix, organizationId, bytes, mimeType }) → key`, `get(key)`, `delete(keys)`. Callers keep only keys and
metadata on their own rows (`Organization.logoKey/bannerKey`, `EventPhoto.imageKey/thumbKey`), so moving to S3/R2 is a
new implementation bound to the `IMAGE_STORE` token — no caller changes. Today's `DbImageStore` keeps bytes in the
`stored_images` table (Postgres bytea); an `AFTER DELETE` trigger on `event_photos` and an FK cascade from
organizations remove orphaned bytes when a draft event or org is deleted (DB store only — an object store would need
an equivalent cleanup job).

- Formats are sniffed from the bytes (PNG/JPEG/WebP) and width/height read from the header
  (`common/images/image-info.ts`, which also holds every limit: logo 512 KB, banner 2 MB, photo 3 MB, thumbnail
  300 KB, 10 per upload, **300 MB gallery quota per mandal**). Phones resize before upload (canvas), and each photo is
  sent with a 400 px thumbnail so grids stay fast.
- The quota is checked under the organization row lock (`SELECT … FOR UPDATE`), so parallel uploads can't overshoot it.
- Payloads carry URLs, never bytes: list queries select only `logoUpdatedAt/bannerUpdatedAt` (`common/org-brand.ts`),
  and the URL is busted by that time (`?v=`), so public logo/banner bytes are cached `immutable`.
- Photos are private by default. Private bytes need GALLERY_VIEW and the bearer token (`private, immutable`
  caching); a public photo of an ACTIVE/COMPLETED festival is served without login (`public, max-age=86400`, since
  it can be made private again).

## Mandal landing page

`LandingPage` (1:1 with the org) holds the editable content and `paidUntil`; `LandingPurchase` mirrors
`CreditRecharge` (demo gateway, 15-minute expiry, idempotent confirm). The confirm serializes on the purchase row and
then the page row and extends from `max(now, paidUntil)`. `paidUntil` changes only there or through an audited
super-admin grant/revoke — the mandal's update DTO has no such field, so `forbidNonWhitelisted` rejects it. The page
(and every `landingSlug` on public payloads) is live only while paid **and** enabled. Paid purchases are platform
revenue (`landingPageEarned`, included in `totalEarned`); grants are free.

## Peak-day pricing

`PriceRule` rows (per event: DATES or WEEKENDS, optional slot subset, fixed price or % uplift) are resolved by one
pure function, `effectivePrice()` in `backend/src/common/pricing.ts`, used by availability, order creation and the
admin preview — so the price a visitor sees is the price charged. Precedence: explicit DATES beat WEEKENDS; within
the winning kind the highest price wins; ties go to the oldest rule. GST slabs are decided on the effective
per-ticket price. Catalogue `fromPrice` stays the minimum base slot price (it isn't date-specific).

## Hardening checklist

- Input validation: global `ValidationPipe` with `whitelist` +
  `forbidNonWhitelisted`, so unknown fields such as `status` or
  `scannerUserId` → 400.
- Errors: `AllExceptionsFilter` returns `{statusCode, message, code}` only.
  Prisma/SQL errors and stacks are logged, never returned.
- Rate limits: per user when authenticated, per IP otherwise.
  - Scan: 120/min.
  - Login/register: 10/min.
  - Global: 600/min.
- Helmet, CORS allow-list, `x-powered-by` off.
- Bearer tokens (no cookies), so there is no CSRF surface.
- Login: constant-ish time (dummy bcrypt compare) and one generic message
  for every failure.
- Production boot refuses short or `change-me` secrets and refuses the mock
  payment provider.
- CSV export has a formula-injection guard.
