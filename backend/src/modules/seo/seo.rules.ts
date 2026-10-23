/**
 * SEO content for the public explore pages: the home page, one page per city
 * (/city/<slug>) and one per category (/category/<key>). The super admin
 * writes an intro shown above the festival grid and a longer text below it,
 * per language (English is the fallback).
 */

export const SEO_KINDS = ['HOME', 'CITY', 'CATEGORY'] as const;
export type SeoKind = (typeof SEO_KINDS)[number];

/** Explore-page categories (frontend lib/explore.ts CATEGORIES) — keep in step. */
export const SEO_CATEGORY_KEYS = ['festivals', 'religious', 'fairs', 'exhibitions', 'shows', 'sports', 'other'] as const;

export const SEO_LANGS = ['en', 'hi', 'bn', 'mr', 'or', 'kn'] as const;

/** Same rule as the frontend's citySlug(): "Navi Mumbai" → "navi-mumbai". */
export function citySlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export const CITY_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** HOME has no key; the URL segment for it is "_". */
export function normaliseKey(kind: SeoKind, key: string | undefined): string | null {
  if (kind === 'HOME') return '';
  const k = (key ?? '').trim().toLowerCase();
  if (kind === 'CATEGORY') return (SEO_CATEGORY_KEYS as readonly string[]).includes(k) ? k : null;
  return CITY_SLUG_RE.test(k) && k.length <= 80 ? k : null;
}
