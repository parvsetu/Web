# Instagram photo import — setup

Mandals connect their **own** Instagram account (Business or Creator) and choose which of its photos appear in the
"From our Instagram" section of their landing page. Nothing is shown until a mandal admin approves it; approved photos
are copied into Parvsetu's photo storage (Instagram's image links expire) and count toward the mandal's 300 MB.

The code is complete. It stays **off in production** until the two environment variables below are set on Render.
Locally and in tests a simulated Instagram (`INSTAGRAM_DEMO=true`) serves sample photos; the API refuses to start with
it in production.

## Why the mandal has to log in (and not just type a handle)

Meta shut down the Instagram Basic Display API in December 2024. Reading posts now needs either the account owner's
permission ("Instagram API with Instagram Login", what Parvsetu uses) or Business Discovery (public Business/Creator
accounts only, and it would let anyone pull someone else's photos). Logging in also proves the photos are the mandal's
own, so showing them on its page is safe. Personal Instagram accounts can't be connected — switching to a Business or
Creator account is free in the Instagram app (Settings → Account type and tools).

## One-time setup (Parvsetu team)

1. **Meta developer account** — <https://developers.facebook.com>, log in with the Facebook account that should own
   the app, and register as a developer.
2. **Create an app** — My Apps → Create app → use case **"Manage messaging & content on Instagram"** (Instagram API
   with Instagram Login). App type: Business.
3. **Instagram → API setup with Instagram login**:
   - Note the **Instagram app ID** and **Instagram app secret** (not the Facebook app ID).
   - **Set up Instagram business login** → *Business login settings* → **OAuth redirect URIs**:
     `https://parvsetu-web.vercel.app/instagram/callback` (plus any custom domain you add later, same path).
   - **Deauthorize callback URL**: `https://parvsetu-api.onrender.com/api/v1/public/instagram/deauthorize`
   - **Data deletion request URL**: `https://parvsetu-api.onrender.com/api/v1/public/instagram/data-deletion`
4. **App settings → Basic**: privacy policy URL `https://parvsetu-web.vercel.app/legal/privacy`, app icon,
   category, contact email.
5. **App roles → Roles → Instagram testers**: add one or two Instagram Business accounts and accept the invite in the
   Instagram app (Settings → Website permissions → Tester invites). Until the app is reviewed, only these accounts can
   connect.
6. **Render** → `parvsetu-api` → Environment: set `INSTAGRAM_APP_ID` and `INSTAGRAM_APP_SECRET`. The API restarts and
   the "Instagram photos" tab starts offering *Connect Instagram*. Try it with a tester account.
7. **App Review** (to let every mandal connect): request **Advanced Access** for `instagram_business_basic`.
   Meta asks for a screen recording of the flow — log in → Mandal → Instagram photos → Connect → approve photos → the
   landing page — and a short description: *"Festival committees connect their own Instagram account so they can choose
   photos from their posts to display on their public festival page on Parvsetu. We only read the account's username
   and media; we never post or read messages."* Complete Business Verification if Meta asks for it. Then switch the app
   to **Live**.

## How it behaves

| Step | What happens |
|---|---|
| Connect | Mandal → Instagram photos → **Connect Instagram** (SETTINGS_UPDATE). Instagram login → back to `/instagram/callback` → the API exchanges the code for a 60-day token (stored encrypted) and runs the first sync. The OAuth `state` is signed, expires in 10 minutes and only works for the admin who started it. One Instagram account can be connected to one mandal. |
| Sync | The latest 60 posts; photos (and each photo of a carousel) become **waiting for review**. Videos are skipped. Every 3 hours the API checks connected accounts that haven't been synced for 12 hours and emails the admin who connected when new photos arrive. Approved and rejected photos are never offered again. |
| Approve | A fresh copy is downloaded (Instagram/Facebook CDN only, ≤ 3 MB, PNG/JPEG/WebP checked from the bytes), stored under the mandal's quota, and shown in the landing page's **From our Instagram** section (newest first, up to 24). Each photo links to its Instagram post, with a *Follow @handle* button. |
| Remove / reject | The stored copy is deleted at once; public links stop working within a day (cache). "Review again" puts it back in the queue. |
| Tokens | Refreshed automatically when less than 15 days are left. If one expires, the tab asks to connect again; photos already on the page stay. |
| Disconnect | The token is deleted and waiting photos dropped; approved photos stay unless the admin ticks "also remove". |
| Meta callbacks | Deauthorize: the connection is closed. Data deletion: everything from that Instagram account is deleted (connection, queue, stored copies) and Meta gets a confirmation code. Both verify Meta's `signed_request` with the app secret. |

The landing section can be moved or hidden under Landing page → Layout; pages saved before it existed get it right
after "Festival photos".
