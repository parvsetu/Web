# Parvsetu — web / PWA frontend

Next.js 14 (App Router) + TypeScript + Tailwind. It talks to the Parvsetu API described in
`../docs/API.md`. All business rules (scan verdicts, permissions, token state) live on the
server. The frontend only displays what the server returns, and hides controls based on the
permission arrays from `/auth/me`.

## Run

```bash
cp .env.example .env.local      # set NEXT_PUBLIC_API_URL if the API isn't on localhost:4000
npm install
npm run dev                     # http://localhost:3000
```

Production: `npm run build && npm start`. Checks: `npx tsc --noEmit`, `npm run lint`.

- `NEXT_PUBLIC_API_URL` is baked in at build time. Rebuild after changing it.
- The backend's `CORS_ORIGINS` must include the frontend's origin (default `http://localhost:3000`).
- **Phones need HTTPS for the camera.** Browsers only allow camera access on `https://` or
  `localhost`. To test on a phone over your LAN, use an HTTPS tunnel or reverse proxy. Plain
  `http://192.168.x.x:3000` will show the "Camera needs a secure link" screen.

## Layout

| Path | What |
|---|---|
| `src/lib/api.ts` | The single API client: bearer token from localStorage, 401 → `/login`, `ApiError` (string or string[] messages), `NetworkError`, timeouts, CSV/blob downloads |
| `src/lib/types.ts` | Response types that mirror API.md |
| `src/lib/permissions.ts` | `can(perms, 'TOKEN_SCAN')` and related helpers (UI hints only) |
| `src/app/e/[eventId]/scan` | Gate scanner (see below) |
| `public/sw.js` | Service worker. It caches the app shell and static assets only, never `/api/` or cross-origin requests. It is registered in production builds only. |

## Scanner guarantees

- **ENTRY ALLOWED** is shown only for an HTTP 200 response with `success: true` and `result: "SUCCESS"`.
- **Each physical scan gets one `idempotencyKey`.**
  - Requests time out after 8 seconds.
  - Network errors and 5xx responses are retried twice automatically with the same key.
  - After that, the scanner shows the amber "Unable to verify token" screen. Its Retry button resends with the same key.
  - A 429 response keeps the key so Retry can resend it.
  - Any other 4xx response is a non-verdict and discards the key. This includes 409 `IDEMPOTENCY_KEY_REUSED`. The next scan always gets a fresh key.
- After a result, the same QR payload is ignored for 4 seconds, so a QR held in front of the camera isn't resubmitted.
- There is no override button. Reactivating a used token is an audited admin action in **Admin → Tokens**. It is never available from the scanner.
