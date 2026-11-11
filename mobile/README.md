# Parvsetu mobile (Expo)

Native iPhone / Android app, built on Expo SDK 58 + Expo Router. It uses the same
`/api/v1` as the website, and all business rules stay on the server.

**What's in it (first cut, visitors + gate):**
- **Browse festivals** (`/public/booking/events`) and **book a day pass**: pick the day,
  slot and group size, then enter name and mobile. A free pass is issued at once. A
  paid pass goes through the demo checkout when the server has demo payments on;
  otherwise it opens the website's checkout.
- **My passes** are saved on the phone (AsyncStorage: order id + access key + the
  last copy of the order), so a pass opens with no signal. You can also add a pass
  from a link received on WhatsApp / SMS.
- **Gate volunteer**: log in (the token is kept in the Keychain / Keystore via
  expo-secure-store), see the festivals with `TOKEN_SCAN`, and scan with the camera.
  Manual code entry is shown only with `TOKEN_MANUAL_ENTRY`. The scanner keeps the
  web scanner's rules: ENTRY ALLOWED only for `success && result === 'SUCCESS'`,
  retries reuse the same idempotency key, network failure means "Unable to verify",
  and there is no override. The screen stays awake while scanning.

Organiser / admin screens stay on the website.

## Run it on a phone (free, no Apple account)

```bash
cd mobile
npm install
npx expo start
```

Scan the QR from the terminal with **Expo Go** (App Store / Play Store). By default
the app talks to production (`app.json` → `extra.apiUrl`). To use a local API:

```bash
EXPO_PUBLIC_API_URL=http://<your-LAN-IP>:4000/api/v1 npx expo start
```

Use your computer's LAN IP, not `localhost`; the phone is a different machine.

Checks: `npx tsc --noEmit`, `npx expo-doctor`, and `npx expo export --platform ios --platform android` (a bundle check).

## Before the App Store / Play Store (not done)

- $99/yr Apple Developer Program (Google Play: $25 once), then `npx eas-cli build`.
- **Refresh tokens**: the API issues access tokens only, so a volunteer has to sign
  in again when the token expires.
- **In-app account deletion** (Apple guideline 5.1.1(v)), because the app has a login.
- **A real payment gateway** (Razorpay) in place of the demo checkout. Passes are a
  physical-event service, so they're allowed outside Apple in-app purchase (3.1.3(e)).
- **No in-app donations** (Apple 3.2.1). The app doesn't offer them; keep it that way,
  or link out to the website.
- Universal links (`/pass/<id>?k=` opening in the app), push notifications (the
  website uses web push; the app would need Expo push tokens + a backend endpoint),
  app icon / splash artwork (the assets are still Expo's defaults), and translations
  (the website's `lib/i18n` dictionaries could be shared).
