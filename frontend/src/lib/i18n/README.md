# Public-site translations

The public website (explore `/`, `/book/*`, `/pass/*`, `/pay/demo/*`, `/f/*`,
`/m/*`, `/r/*`, `/faq`, `/legal/*`) can be shown in English, हिन्दी, বাংলা,
मराठी, ଓଡ଼ିଆ and ಕನ್ನಡ. The organiser / admin app stays English for now
(`isPublicPath()` in `config.ts` decides; add prefixes there to extend it).

> **The Hindi, Bengali, Marathi, Odia and Kannada texts (UI strings and the
> FAQ) were machine-authored.** Have each one reviewed by a native speaker
> before relying on it, especially the FAQ, the content policy and the
> donation-receipt wording. The content-policy page tells visitors that the
> English declaration is the one they agree to.

## How it works

- `locales/en.ts` holds every English string and is the source of truth.
  Every other locale is typed `Messages`, so a missing or misspelt key fails
  `tsc`. At runtime an empty or missing value falls back to English.
- `{name}` placeholders are filled by `t(key, vars)`. Keys ending `_one` and
  `_other` are plural forms, picked with `Intl.PluralRules` via `tp(key, n)`.
  `tn(key, { x: <b/> })` puts React nodes (links, bold words) into a string.
- `t.festivalType(KEY)` gives a festival-type name (`ft.*` keys), and
  `t.city(name)` gives a popular city's name (`city.*`). Anything unknown
  falls back to the English text.
- The language is stored in the `parvsetu_lang` cookie (so server components
  can read it) and in `localStorage`. `?lang=hi` on any URL sets it; that is
  handled in `src/middleware.ts`, so the very first render is already in the
  new language.
- The root layout reads the cookie, sets `<html lang>` and passes the active
  dictionary to `LanguageProvider`. Client components call
  `const { t, tp, locale } = useT()`. Server components call
  `await getServerT()` from `server.ts`.
- Only English is bundled into client code. Other dictionaries load on demand
  (`locales/index.ts`).
- Dates use `format.ts` (`fmtDateL`, `fmtPassWindowL`, …) with `locale`.
  Western digits are forced (`-u-nu-latn`). Money always uses `fmtMoney`
  (en-IN, ₹ grouping).
- Fonts: `fonts.ts` loads the Noto Sans Devanagari, Bengali, Oriya and Kannada
  faces through next/font with `display: swap` and no preload. They come after
  the Latin system fonts in Tailwind's `font-sans` stack, so a browser
  downloads a face only when that script is on screen. `letter-spacing`
  (`tracking-*`) is switched off for non-English pages in `globals.css`,
  because it pulls Indic conjuncts apart.
- What we never translate: anything organisers or users typed (event, mandal
  and venue names, descriptions, slot labels), backend error messages, and the
  share/OG images (`/f/[id]/poster`, `opengraph-image`, which have no Indic
  fonts).

## Adding a language (e.g. Gujarati)

1. Add `{ code: 'gu', native: 'ગુજરાતી', english: 'Gujarati', intl: 'gu-IN' }`
   to `LANGUAGES` in `config.ts`.
2. Copy `locales/hi.ts` to `locales/gu.ts`, rename the constant, and translate
   every value. Keep `{placeholders}`, brand names and acronyms (QR, GST, UPI)
   unchanged.
3. Register `gu: () => import('./gu').then((m) => m.default)` in
   `locales/index.ts`.
4. Optional: add `faq/gu.ts` (same shape as `faq/hi.ts`, same ids) and register
   it in `faq/index.ts`. Untranslated FAQ items fall back to English.
5. Add the script's font in `fonts.ts` (e.g. `Noto_Sans_Gujarati`, subset
   `gujarati`, `variable: '--font-gujr'`) and its CSS variable to the
   `fontFamily.sans` stack in `tailwind.config.ts`.
6. Run `npx tsc --noEmit`. It lists any key you missed.

The switcher and the footer language list read `LANGUAGES`, so the new
language appears there automatically.
