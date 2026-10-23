import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/public-festival';

const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1').replace(/\/+$/, '');

// Rebuilt at most once an hour (new festivals go live during the day).
export const revalidate = 3600;

interface SitemapData {
  festivals: { path: string; updatedAt: string; upcoming: boolean }[];
  mandals: { slug: string; updatedAt: string }[];
  cities?: { slug: string; updatedAt: string | null }[];
  categories?: { key: string; updatedAt: string }[];
}

/** Home, FAQ, policy, city and category pages, every public festival page (/f/<address>) and live mandal page (/m/<slug>). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  let data: SitemapData = { festivals: [], mandals: [] };
  try {
    const res = await fetch(`${API}/public/sitemap`, { next: { revalidate: 3600 } });
    if (res.ok) data = (await res.json()) as SitemapData;
  } catch {
    /* API asleep: still serve the static part */
  }
  return [
    { url: `${base}/`, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/faq`, changeFrequency: 'monthly', priority: 0.4 },
    { url: `${base}/legal/content-policy`, changeFrequency: 'yearly', priority: 0.2 },
    ...data.festivals.map((f) => ({
      url: `${base}/f/${encodeURIComponent(f.path)}`, lastModified: f.updatedAt,
      changeFrequency: f.upcoming ? ('daily' as const) : ('monthly' as const), priority: f.upcoming ? 0.9 : 0.5,
    })),
    ...(data.cities ?? []).map((c) => ({ url: `${base}/city/${encodeURIComponent(c.slug)}`, ...(c.updatedAt ? { lastModified: c.updatedAt } : {}), changeFrequency: 'daily' as const, priority: 0.8 })),
    ...(data.categories ?? []).map((c) => ({ url: `${base}/category/${encodeURIComponent(c.key)}`, lastModified: c.updatedAt, changeFrequency: 'daily' as const, priority: 0.8 })),
    ...data.mandals.map((m) => ({ url: `${base}/m/${encodeURIComponent(m.slug)}`, lastModified: m.updatedAt, changeFrequency: 'weekly' as const, priority: 0.7 })),
  ];
}
