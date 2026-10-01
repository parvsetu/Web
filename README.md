# Parvsetu — Festival / Mandal Management

A platform for any festival or community event (Ganesh Utsav, Durga Puja,
Navratri, Janmashtami, Ram Navami, Dussehra, …). It covers:
- single-use QR entry tokens with configurable validity windows;
- volunteer self-registration and approval;
- permission-based roles;
- donations, expenses, reports and a full audit trail.

```
backend/   NestJS + Prisma + PostgreSQL API (/api/v1) — all business rules
frontend/  Next.js mobile-first PWA (scanner, volunteer home, admin)
docs/      API.md (contract for web/Android/iOS), ARCHITECTURE.md (security model)
```

## Run locally

```bash
docker compose up -d                 # Postgres 16 on localhost:55440 (container: parvsetu-postgres)

cd backend
cp .env.example .env                 # dev secrets; change them for any real deployment
npm install
npx prisma generate
npx prisma migrate deploy
npm run prisma:seed                  # permission catalog + system roles + demo data (SEED_DEMO=false to skip demo)
npm run start:dev                    # http://localhost:4000/api/v1

cd ../frontend
cp .env.example .env.local
npm install && npm run dev           # http://localhost:3000
```

### Demo logins (local password `Parvsetu@123`)

On a deployed instance the demo accounts use `DEMO_PASSWORD` from the host's
environment instead, and the demo super admin (`9000000001`) is not created.

| Who | Login | Can |
|---|---|---|
| Super admin | `super@parvsetu.dev` | everything, all mandals |
| Mandal admin | `admin@parvsetu.dev` | everything in Shree Durga Mandal |
| Gate volunteer | `gate@parvsetu.dev` | scan, Durga Puja only |
| Token desk | `desk@parvsetu.dev` | issue + scan, Durga Puja only |
| Report viewer | `viewer@parvsetu.dev` | read-only reports |
| Treasurer | `treasurer@parvsetu.dev` | donations / expenses |
| Other mandal admin | `navratri-admin@parvsetu.dev` | Navratri Seva Samiti only (isolation demo) |
| Pending applicant | `applicant@parvsetu.dev` | nothing until approved |
| Field agent | `agent@parvsetu.dev` / `9000000030` | Rakesh Kulkarni's agent dashboard (`/agent`), referral code `RAKESH30` (link `/register?ref=RAKESH30`); registers mandals, tracks their review/fees and his earnings |
| Mandal applicant | `mandal-applicant@parvsetu.dev` / `9000000031` | Vikas Deshmukh — the pending self-registration **Shiv Shakti Mitra Mandal** (Nagpur, referred by RAKESH30) with Ganesh Utsav + a custom "Tanha Pola" event; status page at `/registration`. Approve it as the super admin under *Platform → Registrations* |
| Promotional partner (brand) | `partner@parvsetu.dev` / `9000000020` | Tanishq Jewellers' partner portal (`/partner`): ₹5,000 wallet, an approved campaign on every Jan Utsav Samiti festival this month. A second brand, Amul, has a campaign at Shree Durga Mandal waiting in the super admin's *Promotional partners* queue |

`admin@parvsetu.dev` is also the admin of **Jan Utsav Samiti** (Pune), which has an active paid landing page at
[`/m/jan-utsav-samiti`](http://localhost:3000/m/jan-utsav-samiti) (paid until one year after the first seed) and
peak-day pricing on its Diwali Mela (weekends +25%, a dated "Lakshmi Puja peak" +50% on the evening/night slots).
The seed adds no images — upload a logo/banner in Mandal → Settings and photos in a festival's Photos tab.

Registration control: every festival needs platform review and a per-event registration fee before it goes live
(sample pricing: ₹499 default, Ganesh Utsav ₹999; agent referral ₹200 per mandal). Demo festivals that existed before
are treated as already paid. The public explore page is the site home (`/`, alias `/book`); signed-in organisers land
on `/dashboard`.

## Tests

```bash
cd backend
cp .env.test.example .env.test   # local docker test DB settings (first time only)
npm test            # unit + e2e (e2e recreates the local `parvsetu_test` DB from migrations)
npm run lint
npm run typecheck
npm run build
```

The e2e global setup refuses to run against anything except a local `*_test`
database. Key suites:
- `test/scan.e2e-spec.ts`: the single-use guarantee.
  - 20 concurrent devices → exactly 1 SUCCESS + 19 ALREADY_USED, over 5
    rounds.
  - 50 concurrent service calls → 1 success.
  - Idempotent retries, every refusal type, audit rows and the DB backstop.
- `test/access.e2e-spec.ts`: validity configuration, the volunteer lifecycle,
  RBAC and escalation, report access, event/org isolation.
- `test/finance.e2e-spec.ts`: donations, the provider webhook, receipts,
  expenses and the finance report.

## Migrations

`backend/prisma/migrations/*` are applied with `npx prisma migrate deploy`.
Each migration has a hand-written `down.sql` for rollback (Prisma has no
automatic down migrations). The init migration includes hand-written SQL for
the one-success-per-token partial unique index and the CHECK constraints.

## Production notes

- Set long random `JWT_SECRET` and `QR_SIGNING_SECRET`. The app refuses to
  boot with weak ones when `NODE_ENV=production`.
- Rotating `QR_SIGNING_SECRET` invalidates every printed QR.
- Behind a proxy, set `TRUST_PROXY` so scan logs record the real client IP.
- `CORS_ORIGINS` is a comma-separated allow-list of frontend origins.
