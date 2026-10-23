/**
 * SEO text for the explore pages (home, /city/<slug>, /category/<key>),
 * written by the super admin (backend src/modules/seo). Fetched on the server
 * so the text is in the page HTML search engines read.
 */

export type SeoKind = 'HOME' | 'CITY' | 'CATEGORY';

export interface SeoPageContent {
  kind: SeoKind;
  key: string;
  lang: string;
  name: string | null;
  title: string | null;
  metaDescription: string | null;
  aboveText: string | null;
  belowText: string | null;
  updatedAt: string;
}

/** Same rule as the backend's citySlug(): "Navi Mumbai" → "navi-mumbai". */
export function citySlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export const cityPath = (name: string) => `/city/${citySlug(name)}`;
export const categoryPath = (key: string) => `/category/${key}`;

const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

/** Published page for kind + key in `lang` (English fallback); null when there is none or the API is asleep. */
export async function getSeoPage(kind: SeoKind, key: string, lang: string): Promise<SeoPageContent | null> {
  try {
    const res = await fetch(`${API}/public/seo-pages/${kind.toLowerCase()}/${encodeURIComponent(key || '_')}?lang=${encodeURIComponent(lang)}`, { next: { revalidate: 300 } });
    return res.ok ? ((await res.json()) as SeoPageContent) : null;
  } catch {
    return null;
  }
}

/** City name for a slug, from the API's State → City list; else the slug title-cased. */
export async function cityFromSlug(slug: string): Promise<string> {
  try {
    const res = await fetch(`${API}/public/locations`, { next: { revalidate: 86400 } });
    if (res.ok) {
      const states = (await res.json()) as { cities: string[] }[];
      for (const s of states) for (const c of s.cities) if (citySlug(c) === slug) return c;
    }
  } catch {
    /* fall through */
  }
  return slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
