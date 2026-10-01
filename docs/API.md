# Parvsetu API — v1

Base URL: `{API_ORIGIN}/api/v1` (dev: `http://localhost:4000/api/v1`).
Every client (web, PWA, Android, iOS) uses this same API. Business rules live
only on the server.

## Conventions

- **Auth**: `Authorization: Bearer <accessToken>` (JWT). No cookies → no CSRF
  surface. A 401 means the token is missing/expired/revoked → send to login.
- **Errors**: `{ "statusCode": 400, "message": "Human readable", "code"?: "MACHINE_CODE" }`.
  `message` may be a string or an array of validation messages. Never contains
  stack traces or SQL.
- **Pagination**: list endpoints accept `?page=1&pageSize=50` and return
  `{ items: T[], total: number, page: number, pageSize: number }`.
- **Dates**: timestamps are ISO-8601 UTC strings. Calendar dates (`startDate`,
  `date`, `expenseDate`) are `YYYY-MM-DD` interpreted in the event's
  `timezone` (default `Asia/Kolkata`). Slot times are `HH:mm`.
- **Money**: decimal strings, e.g. `"1500.00"`.
- **Permissions**: every endpoint below lists the permission it needs and the
  scope it's checked at (`org` = via the user's organization membership role;
  `event` = org membership role ∪ event assignment role). Super admins pass
  every check. The frontend should hide what the user can't do (using
  `/auth/me`), but the server is the authority.

## Permission keys

```
USER_VIEW USER_CREATE USER_UPDATE USER_DELETE
VOLUNTEER_VIEW VOLUNTEER_CREATE VOLUNTEER_UPDATE VOLUNTEER_DELETE VOLUNTEER_ASSIGN
EVENT_VIEW EVENT_CREATE EVENT_UPDATE EVENT_DELETE
TOKEN_VIEW TOKEN_CREATE TOKEN_GENERATE TOKEN_SCAN TOKEN_MANUAL_ENTRY TOKEN_CANCEL TOKEN_REACTIVATE
DONATION_VIEW DONATION_CREATE DONATION_UPDATE
EXPENSE_VIEW EXPENSE_CREATE EXPENSE_UPDATE
REPORT_VIEW REPORT_EXPORT
ROLE_VIEW ROLE_CREATE ROLE_UPDATE ROLE_DELETE
SETTINGS_VIEW SETTINGS_UPDATE
AUDIT_VIEW
```

- `TOKEN_CREATE` = issue a single token at the desk. `TOKEN_GENERATE` = bulk
  generation + changing a token's validity.
- `TOKEN_MANUAL_ENTRY` = verify by typing the printed code instead of scanning
  the QR. Separate because codes are sequential (guessable).

System roles (seeded, `isSystem: true`, not editable through the API):
`MANDAL_ADMIN` (everything), `VOLUNTEER` (EVENT_VIEW, TOKEN_SCAN),
`TOKEN_ISSUER` (EVENT_VIEW, TOKEN_VIEW, TOKEN_CREATE, TOKEN_SCAN),
`GATE_SUPERVISOR` (VOLUNTEER perms + TOKEN_VIEW, TOKEN_MANUAL_ENTRY, REPORT_VIEW),
`TREASURER` (EVENT_VIEW, DONATION_*, EXPENSE_*, REPORT_VIEW, REPORT_EXPORT),
`REPORT_VIEWER` (EVENT_VIEW, TOKEN_VIEW, VOLUNTEER_VIEW, REPORT_VIEW, REPORT_EXPORT, DONATION_VIEW, EXPENSE_VIEW).

---

## Auth

### `POST /auth/register` — public, rate limited
Self-registration. Creates an account with **no permissions**; if
`organizationId` is given, also files a volunteer application for admin review.
```json
{ "name": "Rahul", "mobile": "9876543210", "email": "r@x.in", "password": "min 8 chars",
  "organizationId": "uuid?", "eventId": "uuid?", "message": "string?" }
```
→ `201 { accessToken, user: MeUser }` (409 `MOBILE_TAKEN` / `EMAIL_TAKEN`)

### `POST /auth/login` — public, rate limited
`{ "identifier": "mobile or email", "password": "..." }` → `200 { accessToken, user: MeUser }`
(401 generic "Invalid credentials" for every failure reason).

### `GET /auth/me`
```ts
MeUser = {
  id, name, mobile, email, isSuperAdmin, status,
  organizations: [{ id, name, slug, role: { id, key, name } | null, permissions: string[] }],
  events: [{ id, name, festivalType, status, startDate, endDate, timezone,
             organization: { id, name }, permissions: string[] }],   // effective perms per event
  applications: [{ id, status, organization: {id,name}, event: {id,name}|null, createdAt, reviewNote }]
}
```
`events` lists every event the user has ≥1 permission on. A user with empty
`organizations` and `events` and a PENDING application is "awaiting approval".

### `POST /auth/change-password` `{ currentPassword, newPassword }` → `204` (revokes other sessions)

---

## Public

### `GET /public/events`
Events open for volunteer sign-up (`status ACTIVE|DRAFT` and
`volunteerRegistrationOpen`). → `[{ id, name, festivalType, startDate, endDate, location, organization: { id, name } }]`

### `GET /public/festival-types` → `[{ key: "GANESH_UTSAV", label: "Ganesh Utsav", defaultPrefix: "GAN" }, …]`

---

## Organizations (mandals)

| Method | Path | Permission |
|---|---|---|
| GET | `/organizations` | any (super admin: all; others: where member) |
| POST | `/organizations` `{ name, city?, address?, slug? }` | super admin |
| GET | `/organizations/:orgId` | EVENT_VIEW@org |
| PATCH | `/organizations/:orgId` `{ name?, city?, address? }` | SETTINGS_UPDATE@org |

### Members (org-wide roles)
| GET | `/organizations/:orgId/members` | USER_VIEW@org |
|---|---|---|
| POST | `/organizations/:orgId/members` `{ name, mobile, email?, password?, roleId }` | USER_CREATE@org |
| PATCH | `/organizations/:orgId/members/:userId` `{ roleId?, status?: "ACTIVE"\|"INACTIVE", reason? }` | USER_UPDATE@org |
| DELETE | `/organizations/:orgId/members/:userId` | USER_DELETE@org |

Member: `{ userId, name, mobile, email, status, role: {id,key,name}, createdAt }`.
POST creates the user if the mobile is new (returns `temporaryPassword` once
when no password was supplied) or attaches the existing user.
**Role escalation guard**: you can only grant a role whose permissions are a
subset of your own at that org (403 `ROLE_ESCALATION`). Nobody can change
their own role/status.

### Roles
| GET | `/permissions` | any → `[{ key, group, description }]` |
|---|---|---|
| GET | `/organizations/:orgId/roles` | ROLE_VIEW@org → system + this org's custom roles |
| POST | `/organizations/:orgId/roles` `{ name, description?, permissions: string[] }` | ROLE_CREATE@org |
| PATCH | `/organizations/:orgId/roles/:roleId` `{ name?, description?, permissions? }` | ROLE_UPDATE@org (not system) |
| DELETE | `/organizations/:orgId/roles/:roleId` | ROLE_DELETE@org (409 if in use) |

Role: `{ id, key, name, description, isSystem, organizationId, permissions: string[], memberCount, assignmentCount }`.
Assignable roles for dropdowns = this list (GET). Requires ROLE_VIEW; admins
without it can still pass any roleId they know — the server checks.

### Volunteers
| GET | `/organizations/:orgId/volunteers?eventId&status&q` | VOLUNTEER_VIEW@org |
|---|---|---|
| POST | `/organizations/:orgId/volunteers` | VOLUNTEER_CREATE@org + VOLUNTEER_ASSIGN@event |
| PATCH | `/organizations/:orgId/volunteers/:userId` `{ name?, email? }` | VOLUNTEER_UPDATE@org |
| POST | `/organizations/:orgId/volunteers/:userId/activate` `{ reason? }` | VOLUNTEER_UPDATE@org |
| POST | `/organizations/:orgId/volunteers/:userId/deactivate` `{ reason? }` | VOLUNTEER_UPDATE@org |
| GET | `/organizations/:orgId/volunteer-applications?status=PENDING` | VOLUNTEER_VIEW@org |
| POST | `/organizations/:orgId/volunteer-applications/:id/approve` `{ eventId, roleId }` | VOLUNTEER_ASSIGN@event |
| POST | `/organizations/:orgId/volunteer-applications/:id/reject` `{ reason? }` | VOLUNTEER_ASSIGN@org |

Create volunteer body:
`{ name, mobile, email?, password?, eventId, roleId?, status?: "ACTIVE"|"INACTIVE" }`
(`roleId` defaults to system `VOLUNTEER`). → `{ volunteer: Volunteer, temporaryPassword?: string }`

Volunteer: `{ userId, name, mobile, email, accountStatus, assignments: [{ id, eventId, eventName, role: {id,key,name}, status }] }`.
Deactivate = every assignment of that user in this org → INACTIVE (their
login still works but grants nothing here).

Self-service (any logged-in user):
- `POST /volunteer-applications` `{ organizationId, eventId?, message? }` → Application (409 if one is already PENDING)
- `GET /me/applications`

### Event assignments
| GET | `/events/:eventId/assignments` | VOLUNTEER_VIEW@event |
|---|---|---|
| POST | `/events/:eventId/assignments` `{ userId, roleId }` | VOLUNTEER_ASSIGN@event |
| PATCH | `/events/:eventId/assignments/:assignmentId` `{ roleId?, status?, reason? }` | VOLUNTEER_ASSIGN@event |
| DELETE | `/events/:eventId/assignments/:assignmentId` | VOLUNTEER_DELETE@event |

The user must already be known to the org (member, applicant or assigned
elsewhere in the org) — otherwise 404.

### Audit log
`GET /organizations/:orgId/audit-logs?eventId&action&page` — AUDIT_VIEW@org →
paged `{ id, action, entityType, entityId, before, after, reason, createdAt, actor: {id,name}|null, eventId }`.

---

## Events (festivals)

| GET | `/events` | any → events where user has EVENT_VIEW (same shape as `/auth/me` events) |
|---|---|---|
| GET | `/organizations/:orgId/events` | EVENT_VIEW@org |
| POST | `/organizations/:orgId/events` | EVENT_CREATE@org |
| GET | `/events/:eventId` | EVENT_VIEW@event |
| PATCH | `/events/:eventId` | EVENT_UPDATE@event |
| DELETE | `/events/:eventId` | EVENT_DELETE@event (DRAFT and no tokens only) |

Event body: `{ name, festivalType, description?, location?, startDate, endDate,
timezone?, status?: DRAFT|ACTIVE|COMPLETED|CANCELLED, tokenPrefix?,
volunteerRegistrationOpen?, maxVisitorsPerToken? }` (`tokenPrefix` 2–6
uppercase letters/digits, defaults from festivalType).

Event: `{ id, organizationId, organization: {id,name}, name, festivalType,
description, location, startDate, endDate, timezone, status, tokenPrefix,
volunteerRegistrationOpen, maxVisitorsPerToken, createdAt, myPermissions: string[] }`.

Scanning requires status `ACTIVE`; issuing requires `DRAFT` or `ACTIVE`.

### Time slots (token validity configuration)
| GET | `/events/:eventId/time-slots` | EVENT_VIEW@event |
|---|---|---|
| POST | `/events/:eventId/time-slots` `{ label, startTime, endTime, capacity?, isActive?, sortOrder? }` | SETTINGS_UPDATE@event |
| PATCH | `/events/:eventId/time-slots/:slotId` | SETTINGS_UPDATE@event |
| DELETE | `/events/:eventId/time-slots/:slotId` | SETTINGS_UPDATE@event (deactivates if tokens reference it) |

Slot: `{ id, label, startTime, endTime, capacity, isActive, sortOrder, crossesMidnight }`.
Changing a slot does **not** change tokens already issued (they carry their own
concrete window); use the per-token validity endpoint for that.

---

## Tokens

Validity input (exactly one form):
- slot: `{ "timeSlotId": "uuid", "date": "2026-09-05" }` (date must be within the event's dates)
- custom: `{ "validFrom": "ISO", "validUntil": "ISO" }`

### `POST /events/:eventId/tokens` — TOKEN_CREATE@event
`{ ...validity, visitorName?, visitorMobile?, visitorCount? (1..maxVisitorsPerToken) }` → `201 TokenWithQr`

### `POST /events/:eventId/tokens/bulk` — TOKEN_GENERATE@event
`{ ...validity, count (1..1000), visitorCount? }` → `201 { count, tokens: TokenWithQr[] }`

### `GET /events/:eventId/tokens?status&timeSlotId&date&q&page&pageSize` — TOKEN_VIEW@event
`status` ∈ `ACTIVE|USED|EXPIRED|CANCELLED` (EXPIRED/ACTIVE are computed from
the window). `q` matches token code / visitor name / mobile. → paged `Token`.

### `GET /events/:eventId/tokens/:tokenId` — TOKEN_VIEW@event → `TokenWithQr & { scans: ScanLogRow[] }`
### `GET /events/:eventId/tokens/:tokenId/qr.png` — TOKEN_VIEW@event → PNG image

```ts
Token = { id, tokenCode, status /* stored */, effectiveStatus /* ACTIVE|USED|EXPIRED|CANCELLED|NOT_YET_VALID */,
  validFrom, validUntil, visitorCount, timeSlot: {id,label}|null,
  visitor: { name, mobile }|null, issuedAt, issuedBy: {id,name}|null,
  usedAt, usedBy: {id,name}|null, cancelledAt, cancellationReason }
TokenWithQr = Token & { qrPayload: string }   // encode this string into the QR
```

### `POST /events/:eventId/tokens/:tokenId/cancel` — TOKEN_CANCEL@event
`{ reason }` (≥3 chars). Only ACTIVE tokens. Audited.

### `PATCH /events/:eventId/tokens/:tokenId/validity` — TOKEN_GENERATE@event
`{ ...validity, reason }`. Only ACTIVE (unused) tokens. Audited.

### `POST /events/:eventId/tokens/:tokenId/reactivate` — TOKEN_REACTIVATE@event
Administrative recovery, **never** available from the scanner.
`{ reason (≥10 chars), confirmTokenCode (must equal the token's code) }`.
Only USED tokens. Voids the original SUCCESS scan (kept, marked voided),
returns the token to ACTIVE, writes an audit log.

### `POST /tokens/scan` — TOKEN_SCAN@event (rate limited)
```json
{ "eventId": "uuid", "qrPayload": "PSQR1.xxx.yyy", "idempotencyKey": "uuid" }
```
or manual entry (also needs TOKEN_MANUAL_ENTRY): `{ "eventId", "tokenCode": "GAN-2026-000582", "idempotencyKey" }`.

`idempotencyKey`: generate one per physical scan on the device and **reuse it
on retries** of that same scan. A retry with the same key replays the original
result (`replayed: true`) instead of being treated as a new scan. Reusing a key
for a *different* token/event returns `409 { code: "IDEMPOTENCY_KEY_REUSED" }`
(never a replayed success) — generate a fresh key and rescan.

Always `200` for a token verdict (including denials) with:
```ts
ScanResponse = {
  success: boolean,
  result: "SUCCESS"|"ALREADY_USED"|"EXPIRED"|"NOT_YET_VALID"|"CANCELLED"|"INVALID"|"WRONG_EVENT",
  status: "USED"|"ACTIVE"|"EXPIRED"|"CANCELLED"|null,  // token status after the scan
  message: string,               // show this verbatim
  tokenCode: string|null,
  usedAt: string|null, scannedBy: { id, name }|null,   // for SUCCESS and ALREADY_USED
  validFrom: string|null, validUntil: string|null,     // for EXPIRED / NOT_YET_VALID
  visitorCount: number|null, timeSlot: { label }|null,
  scannedAt: string, replayed: boolean
}
```
`403 { result: "UNAUTHORIZED", success: false, message }` when the caller can't
scan for that event (also logged). `400` for a malformed body. `429` when rate
limited. Messages:

| result | message |
|---|---|
| SUCCESS | Token verified successfully. Entry allowed. |
| ALREADY_USED | This token has already been used. |
| EXPIRED | This token has expired. |
| NOT_YET_VALID | This token is not valid yet. |
| CANCELLED | This token has been cancelled. |
| WRONG_EVENT | This token is not valid for this event. |
| INVALID | The QR token could not be verified. |

Network failure ≠ verdict: the client must show "Unable to verify token" and
never infer success.

### Scan history
- `GET /events/:eventId/scans?result&userId&date&page` — REPORT_VIEW@event → paged
  `ScanLogRow = { id, scanTime, result, method, failureReason, tokenCode|null, user: {id,name}, voided: boolean }`
- `GET /me/scans?eventId&page` — own scans (TOKEN_SCAN@event)
- `GET /events/:eventId/my-summary` — TOKEN_SCAN or TOKEN_CREATE@event:
  `{ event: {id,name,festivalType,status}, today: { date, entries, visitors }, me: { scans, successful, duplicate, expired, notYetValid, invalid, other, lastActiveAt } }`
  (today = event-wide successful entries/visitor count today; me = my scans today)

---

## Donations

| GET | `/events/:eventId/donations?status&method&from&to&q&page` | DONATION_VIEW@event |
|---|---|---|
| POST | `/events/:eventId/donations` | DONATION_CREATE@event |
| GET | `/events/:eventId/donations/:id` | DONATION_VIEW@event |
| PATCH | `/events/:eventId/donations/:id` `{ paymentStatus?, paymentReference?, notes?, reason? }` | DONATION_UPDATE@event |
| GET | `/events/:eventId/donations/:id/receipt` | DONATION_VIEW@event |
| GET | `/payments/providers` | any → `[{ key, label, online }]` |
| POST | `/payments/webhooks/:provider` | public; the provider verifies its own signature |

Create: `{ donorName, donorMobile?, donorEmail?, amount, method, provider?: "manual", paymentReference?, notes?, donatedAt? }`.
`manual` (cash/UPI already received) → `SUCCESS` immediately + receipt
number. An online provider → `PENDING` and response includes
`payment: { provider, providerOrderId, checkoutUrl?|upiUri? }`; status flips via
webhook. Donation: `{ id, receiptNo, donorName, donorMobile, donorEmail, amount, currency, method, paymentStatus, paymentProvider, paymentReference, donatedAt, notes, createdBy }`.
Receipt: `{ receiptNo, organization: {name, city, address}, event: {name}, donorName, amount, amountInWords, method, paymentReference, donatedAt }` (409 unless SUCCESS).

## Expenses

| GET | `/events/:eventId/expenses?category&from&to&page` | EXPENSE_VIEW@event |
|---|---|---|
| POST | `/events/:eventId/expenses` `{ category, description, amount, expenseDate, vendor?, receiptRef? }` | EXPENSE_CREATE@event |
| PATCH | `/events/:eventId/expenses/:id` | EXPENSE_UPDATE@event (audited) |

Expense: `{ id, category, description, amount, expenseDate, vendor, receiptRef, createdBy: {id,name}|null, createdAt }`.

---

## Reports — REPORT_VIEW@event (append `format=csv` → CSV, needs REPORT_EXPORT)

All accept `?from=YYYY-MM-DD&to=YYYY-MM-DD` (event timezone) unless noted.

- `GET /events/:eventId/reports/tokens` → `{ total, active, used, expired, cancelled, notYetValid, bySlot: [{ timeSlotId, label, total, used, active, expired, cancelled }] }`
- `GET /events/:eventId/reports/visitors` → `{ totalVisitors, totalEntries, bySlot: [{ timeSlotId, label, entries, visitors }], byDate: [{ date, entries, visitors }], byHour: [{ hour, entries, visitors }] }`
  (visitors = Σ visitorCount over successful entries)
- `GET /events/:eventId/reports/scans?userId` → `{ total, success, alreadyUsed, expired, notYetValid, cancelled, invalid, wrongEvent, unauthorized }`
- `GET /events/:eventId/reports/volunteers` → `[{ userId, name, total, successful, duplicate, expired, notYetValid, invalid, other, failed, lastActiveAt }]` (from scan logs)
- `GET /events/:eventId/volunteers/:userId/activity` (VOLUNTEER_VIEW or REPORT_VIEW) → `{ user: {id,name}, stats: <one volunteers row>, recentScans: ScanLogRow[] }`
- `GET /events/:eventId/reports/finance` — DONATION_VIEW + EXPENSE_VIEW → `{ donations: { total, count, byMethod: [{method,total,count}], pending }, expenses: { total, count, byCategory: [{category,total,count}] }, balance }`
- `GET /events/:eventId/reports/summary` → `{ event: {id,name}, tokens: {total, used, unused, expired, cancelled}, visitors: {total, entries}, scans: {total, success, failed}, donations: {total,count}|null, expenses: {total,count}|null, balance: string|null, restricted: string[] }`
  — financial blocks are `null` and listed in `restricted` when the caller lacks DONATION_VIEW / EXPENSE_VIEW.
- `GET /events/:eventId/dashboard?date=YYYY-MM-DD` → `{ date, today: { visitors, entries, tokensIssued, used, unused, expired, cancelled }, overall: <summary>, volunteerActivity: <volunteers rows, top 10>, recentScans: ScanLogRow[] (20), hourly: [{hour, entries}] }`
- `GET /organizations/:orgId/reports/events` (REPORT_VIEW@org) → `[summary per event]`

---

## Platform (super admin)
- `GET /users?q&page` → paged `{ id, name, mobile, email, status, isSuperAdmin, createdAt }`
- `PATCH /users/:userId` `{ status?: ACTIVE|DISABLED, isSuperAdmin?, reason? }` (can't change self)

---

## Added: public pass booking (no login)

All under `/public/booking`, rate limited per IP. Money and capacity are
decided by the server; the client never sends a price.

- `GET /public/booking/events?state&city&q` →
  `[{ id, name, festivalType, description, location, state, city, startDate, endDate, timezone, maxVisitorsPerToken, organization: { name, city }, fromPrice: "50.00"|null, onlinePayments: boolean }]`
  (events with `publicBookingEnabled` and status ACTIVE)
- `GET /public/booking/events/:eventId` → the above plus
  `{ holdMinutes: 15, slots: [{ id, label, startTime, endTime, price: "50.00", capacity }] }` (404 if not bookable)
- `GET /public/booking/events/:eventId/availability?date=YYYY-MM-DD` →
  `{ date, slots: [{ id, label, startTime, endTime, price, validFrom, validUntil, ended: boolean, remaining: number|null }] }`
  (`remaining` null = unlimited; ended slots have remaining 0)
- `POST /public/booking/orders`
  `{ eventId, timeSlotId, date, visitorCount, buyerName, buyerMobile, buyerEmail? }` →
  `201 PassOrder & { accessKey }`. Errors: 409 `SLOT_FULL`, 400 (slot ended / date outside festival /
  too many people), 503 (paid slot but no online payment configured), 429.
  - price 0 → order comes back `PAID` with `pass` filled immediately.
  - otherwise `PENDING`, `payment: { provider: "demo", demo: true }` → send the buyer to the demo checkout.
  - The order holds the places for 15 minutes (`expiresAt`).
- `GET /public/booking/orders/:orderId?k=<accessKey>` → `PassOrder` (404 for unknown id OR wrong key).
  A PENDING order past `expiresAt` comes back `EXPIRED`.
- `POST /public/booking/orders/:orderId/demo-pay` `{ k, outcome: "success" | "fail" }` → `PassOrder`
  (only when the server has demo payments on; 409 `ORDER_EXPIRED` / `ORDER_CLOSED`). Idempotent.

```ts
PassOrder = {
  id, status: 'PENDING'|'PAID'|'FAILED'|'EXPIRED', amount: "150.00", unitPrice: "50.00", currency: 'INR',
  visitorCount, buyerName, buyerMobile, validFrom, validUntil, expiresAt, paidAt, createdAt,
  payment: { provider: 'demo'|'free', demo: boolean },
  event: { id, name, festivalType, timezone, location, organization: { name } },
  timeSlot: { label },
  pass: null | { tokenCode, qrPayload /* encode into the QR */, status: 'ACTIVE'|'USED'|'EXPIRED'|'NOT_YET_VALID'|'CANCELLED', usedAt }
}
```
The buyer's link to their pass is `/pass/<orderId>?k=<accessKey>` — keep it like a ticket.

Admin: `GET /events/:eventId/pass-orders?status&q&page` (DONATION_VIEW) → paged rows +
`totals: { paidOrders, revenue, visitors }`. Event body gains `publicBookingEnabled`; time slots gain
`price` (decimal string, "0" = free). Finance report gains `passSales: { total, count, visitors }` and
`balance = donations + passSales − expenses`; summary gains `passSales` (null when restricted).

## Added: accounts (mandal-wide expenses + yearly P&L)

- `GET /organizations/:orgId/expenses?eventId=<id>|none&category&from&to&q&page` (EXPENSE_VIEW@org) → paged `Expense & { eventId, event: {id,name}|null }` + `totalAmount`
- `POST /organizations/:orgId/expenses` `{ category, description, amount, expenseDate, vendor?, receiptRef?, eventId? }` (EXPENSE_CREATE@org; no eventId = general mandal expense)
- `PATCH /organizations/:orgId/expenses/:id` (EXPENSE_UPDATE@org)
- `GET /organizations/:orgId/reports/annual?year=2026&basis=calendar|financial&format=csv` (REPORT_VIEW + DONATION_VIEW + EXPENSE_VIEW @org) →
  `{ year, basis, label: "2026"|"FY 2026-27", from, to, income: { total, donations, passSales, donationCount, passOrderCount }, expenses: { total, count }, net, result: 'PROFIT'|'LOSS'|'BREAK_EVEN', byMonth: [{ month, label, donations, passSales, income, expenses, net }], byEvent: [{ eventId|null, name, festivalType, donations, passSales, expenses, net }], byCategory: [{ category, total }] }`
- `GET /public/expense-categories` → string[] (suggestions)

## Added: places & festivals

- `GET /public/locations` → `[{ code, name, type: 'STATE'|'UT', cities: string[] }]` (36 states/UTs)
- `GET /public/festival-types` → now ~57 entries `{ key, label, defaultPrefix, group, months? }` (group: Hindu, Muslim, Sikh, Christian, Buddhist, Jain, Parsi, Regional & Harvest, National & Cultural, Other)
- Organization and Event bodies/responses gain `state` (must be a listed state name; "" clears) and `city` (free text). New events default to the mandal's state/city.

## Changed: auth (email activation, forgot password)

- `POST /auth/register` now **requires `email`** and returns `{ verificationRequired: true, email, maskedEmail }` (no token). A 6-digit code is emailed.
- `POST /auth/verify-email` `{ email, code }` → `{ accessToken, user }` (400 `INVALID_CODE`)
- `POST /auth/resend-verification` `{ email }` → `{ sent: true }` always (server enforces 60 s cooldown, 5/hour)
- `POST /auth/login` → additionally `403 { code: 'EMAIL_NOT_VERIFIED', email, maskedEmail }` for an unverified self-registered account (a fresh code is sent)
- `POST /auth/forgot-password` `{ identifier }` (mobile or email) → `{ sent: true }` always
- `POST /auth/reset-password` `{ identifier, code, newPassword }` → 204 (other sessions signed out)
- `POST /auth/me/email/send-code`, `POST /auth/me/email/verify { code }` (logged in)
- `MeUser` gains `emailVerified: boolean`. Codes: 6 digits, 10-minute expiry, 5 attempts.

## Changed: lists are paged + searchable

Now return `{ items, total, page, pageSize }` and accept `?q=&page=&pageSize=` (max 200):
`/organizations`, `/organizations/:orgId/members`, `/organizations/:orgId/volunteers`,
`/organizations/:orgId/volunteer-applications`, `/organizations/:orgId/events`,
`/events/:eventId/assignments`. Search (`q`) also added to `/events/:eventId/scans`,
expenses, and audit logs.

---

## Added: payout accounts, split settlements, shareable receipts

Money is in rupee strings ("194.00"). Bank account numbers and PANs are
encrypted at rest and only ever returned masked (`XXXXXX9012`).

### Mandal payout account (registered OR unregistered)
- `GET /organizations/:orgId/payout-account` (SETTINGS_VIEW@org) → `PayoutAccount | null`
- `PUT /organizations/:orgId/payout-account` (SETTINGS_UPDATE@org) — submit or change; always goes back to `PENDING` review.
  Body:
  ```ts
  { entityType: 'REGISTERED' | 'UNREGISTERED',
    registeredType?: 'TRUST'|'SOCIETY'|'SECTION8'|'PARTNERSHIP'|'PROPRIETORSHIP'|'OTHER', // registered only (required)
    legalName, registrationNumber? /* registered: required */, orgPan? /* registered: required, ABCDE1234F */,
    gstin?, reg80G?, reg12A?,                                   // registered only
    addressLine, city, state /* state name or code */, pincode /* 6 digits */,
    contactName, contactRole, contactPhone /* 10-digit */, contactEmail,
    signatoryPan /* PAN of authorised person — for unregistered this is the main identity */,
    bankHolderName, bankAccount /* 9–18 digits; ask twice in the UI */, ifsc /* SBIN0001234 */, accountType: 'SAVINGS'|'CURRENT',
    proofDataUrl?: 'data:image/png|image/jpeg|application/pdf;base64,…' /* cancelled cheque/passbook, ≤2 MB */,
    consent: true }
  ```
  `PayoutAccount = { entityType, registeredType, legalName, registrationNumber, orgPan (masked|null), gstin, reg80G, reg12A, addressLine, city, state, pincode, contactName, contactRole, contactPhone, contactEmail, signatoryPan (masked), bankHolderName, bankAccount (masked), ifsc, accountType, hasProof, status: 'PENDING'|'VERIFIED'|'NEEDS_CORRECTION'|'REJECTED', reviewNote, reviewedAt, gatewayAccountId, submittedAt, updatedAt }`
- `GET /organizations/:orgId/settlements?status&page` (DONATION_VIEW@org) → paged
  `{ id, createdAt, event: {id,name}|null, sourceType, gross, gatewayFee, commission, net, status: 'PENDING_PAYOUT'|'PAID_OUT', payoutId }`
  + `totals: { gross, commission, gatewayFees, netToMandals, pendingPayout, paidOut }`
- `GET /organizations/:orgId/payouts` → paged `{ id, amount, reference /* UTR */, note, paidAt, settlements }`

Rules: **paid** online orders require a VERIFIED payout account (else 409 `PAYOUTS_NOT_READY`); the
platform commission is taken from the payment (settlement), *not* from prepaid credit. Prepaid credit is
used for internal passes (desk, bulk, donation, free online) and partner printing. `onlinePayments` in the
booking API is now false until the mandal is verified.

### Super admin
- `GET /platform/payout-accounts?status&page` → paged `PayoutAccount & { organizationId, organization: {name, city, state} }`
- `POST /platform/payout-accounts/:orgId/review` `{ decision: 'VERIFIED'|'NEEDS_CORRECTION'|'REJECTED', note? (required unless VERIFIED), gatewayAccountId? }`
- `GET /platform/payout-accounts/:orgId/proof` → the uploaded image/PDF (send with bearer; open as blob)
- `POST /platform/payout-accounts/:orgId/reveal-bank` → `{ bankHolderName, bankAccount (FULL), ifsc, accountType }` (verified only; audited)
- `GET /platform/settlements?organizationId&status&page`, `GET /platform/payouts?organizationId&page` (same shapes, with `organization: {id,name}`)
- `POST /platform/payouts` `{ organizationId, reference /* bank UTR */, note? }` → pays out ALL pending settlements of that mandal → `{ id, amount, reference, settlements, paidAt }` (400 if nothing pending)
- `PUT /platform/billing/settings` also accepts `gatewayFeePercent` (deducted from the mandal's share); GET returns it.
  Billing summary adds `splitCommissionEarned`, `onlineGross`; `totalEarned` includes split commission.

### Donation receipts
- `POST /events/:eventId/donations/:id/share` (DONATION_VIEW) → `{ path: "/r/<id>?k=<key>", url }` (only SUCCESS donations)
- `POST /events/:eventId/donations/:id/email-receipt` (DONATION_VIEW) → `{ sent: true }` (donor must have an email)
- `GET /public/receipts/:id?k=<key>` (public) → `Receipt` (404 on wrong key)
- `Receipt` now also has `issuer: { legalName, entityType, registrationNumber, pan, reg80G, reg12A, address } | null`
  (only when the mandal's payout account is VERIFIED), `donorMobile`, `donorEmail`, `event.festivalType`, `organization.state`.

## GST on online passes

Event fields (`POST/PATCH /events…`): `gstEnabled`, `gstMode: 'SLAB'|'FLAT'` (default `SLAB`),
`gstLowRatePercent` (default 5), `gstSlabThreshold` in ₹ (default 100), `gstRatePercent` (default 18; the
rate above the threshold in SLAB mode, the only rate in FLAT mode), `gstBearer: 'CUSTOMER'|'MANDAL'`, `gstSac`.

SLAB is decided **per ticket (per person), on its pre-GST value**: a ticket of ₹100 or less is taxed at the low
rate, a dearer one at the high rate, regardless of how many people are on the order. For a mandal-borne
(GST-inclusive) price the taxable value is the price minus the low-rate GST. The applied rate is stored on each
order (`gstRateBps`) and shown on its tax invoice and in `GET /events/:id/reports/gst` (`byRate`).
The default slabs (≤ ₹100 → 5%, above → 18%) are an assumption the mandal should confirm with its CA.
