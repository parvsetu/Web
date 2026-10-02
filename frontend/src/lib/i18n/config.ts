/**
 * Languages offered on the public website. To add one (e.g. Gujarati):
 *   1. add an entry here,
 *   2. create `locales/gu.ts` (copy `locales/hi.ts`, translate the values),
 *   3. register its loader in `locales/index.ts`,
 *   4. optionally add `faq/gu.ts` and register it in `faq/index.ts`.
 * See README.md in this folder.
 */
export const LANGUAGES = [
  { code: 'en', native: 'English', english: 'English', intl: 'en-IN' },
  { code: 'hi', native: 'हिन्दी', english: 'Hindi', intl: 'hi-IN' },
  { code: 'bn', native: 'বাংলা', english: 'Bengali', intl: 'bn-IN' },
  { code: 'mr', native: 'मराठी', english: 'Marathi', intl: 'mr-IN' },
  { code: 'or', native: 'ଓଡ଼ିଆ', english: 'Odia', intl: 'or-IN' },
  { code: 'kn', native: 'ಕನ್ನಡ', english: 'Kannada', intl: 'kn-IN' },
] as const;

export type Lang = (typeof LANGUAGES)[number]['code'];

export const DEFAULT_LANG: Lang = 'en';

/** Cookie (read by server components) and localStorage key. */
export const LANG_COOKIE = 'parvsetu_lang';
export const LANG_STORAGE_KEY = 'parvsetu.lang';
/** `?lang=hi` on any public URL switches the language (handy for sharing). */
export const LANG_PARAM = 'lang';
/** Set by middleware so the root layout knows the path (for `<html lang>`). */
export const PATH_HEADER = 'x-parvsetu-path';

export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && LANGUAGES.some((l) => l.code === v);
}

export function langInfo(lang: Lang) {
  return LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];
}

/**
 * BCP-47 tag for Intl. Western digits everywhere (bn/mr would otherwise use
 * native digits for dates but not for prices and counts we print ourselves).
 */
export function intlLocale(lang: Lang): string {
  const base = langInfo(lang).intl;
  return lang === 'en' ? base : `${base}-u-nu-latn`;
}

/**
 * Pages that follow the visitor's language. Everything else (the organiser /
 * admin app) stays English for now — add prefixes here to extend it.
 */
const PUBLIC_PREFIXES = ['/book', '/pass', '/pay/demo', '/f/', '/m/', '/r/', '/faq', '/legal'];

export function isPublicPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (pathname === '/') return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p.endsWith('/') ? p : `${p}/`));
}
